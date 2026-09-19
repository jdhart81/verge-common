"""Encrypted Mac pull backups and local operational receipts; never restores production."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

HERE = Path(__file__).resolve().parent


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def private_path(path, directory=False):
    path = Path(path)
    info = path.lstat()
    expected = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if path.is_symlink() or not expected or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('Private storage permissions are required')
    return path


def digest_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def save_json(path, record):
    path = Path(path)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf8', dir=path.parent, prefix=path.name + '.', delete=False) as output:
        temporary = Path(output.name)
        try:
            os.chmod(temporary, 0o600)
            json.dump(record, output, indent=2)
            output.write('\n')
            output.flush()
            os.fsync(output.fileno())
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
    os.replace(temporary, path)


def gpg_command(config):
    private_path(config['keyFile'])
    private_path(config['gpgHome'], directory=True)
    return [config['gpg'], '--homedir', config['gpgHome'], '--batch', '--no-tty', '--no-symkey-cache', '--pinentry-mode', 'loopback', '--passphrase-file', config['keyFile']]


def encrypt_stream(config, source, destination):
    # Secret bytes are read by GnuPG from a restricted file, never argv or logs.
    with open(destination, 'xb') as output:
        os.chmod(destination, 0o600)
        result = subprocess.run(gpg_command(config) + ['--symmetric', '--cipher-algo', 'AES256', '--compress-algo', 'none', '--output', '-'], stdin=source, stdout=output, stderr=subprocess.PIPE, timeout=600)
        if result.returncode:
            raise ValueError('Backup encryption failed')
        output.flush()
        os.fsync(output.fileno())


def extract_stream(source, target, maximum_bytes=2_000_000_000):
    """Extract only bounded regular files/directories into an empty private tree."""
    target = Path(target)
    count = size = 0
    with tarfile.open(fileobj=source, mode='r|gz') as archive:
        for member in archive:
            count += 1
            path = PurePosixPath(member.name)
            if count > 50000 or path.is_absolute() or '..' in path.parts or not path.parts:
                raise ValueError('Unsafe backup archive path')
            if not (member.isfile() or member.isdir()):
                raise ValueError('Backup archive links and special files are refused')
            if path.parts[0] not in ('snapshot', 'erasure-ledger', 'ledger-receipt.json'):
                raise ValueError('Unexpected backup archive root')
            if member.size < 0:
                raise ValueError('Invalid archive size')
            size += member.size
            if size > maximum_bytes:
                raise ValueError('Backup exceeds configured extraction size')
            destination = target.joinpath(*path.parts)
            if member.isdir():
                destination.mkdir(parents=True, exist_ok=True, mode=0o700)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with archive.extractfile(member) as incoming, open(destination, 'xb') as output:
                    os.chmod(destination, 0o600)
                    shutil.copyfileobj(incoming, output, 1024 * 1024)


def decrypt_extract(config, archive, target):
    process = subprocess.Popen(gpg_command(config) + ['--decrypt', '--output', '-', str(archive)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        extract_stream(process.stdout, target, config.get('maximumExtractedBytes', 2_000_000_000))
        # Consume all plaintext so GnuPG verifies the authenticated trailer.
        while process.stdout.read(1024 * 1024):
            pass
        if process.wait(timeout=600):
            raise ValueError('Backup decryption or integrity verification failed')
    except Exception:
        process.kill()
        process.wait()
        raise
    finally:
        process.stdout.close()


def validate_ledger(directory, expected=None):
    receipt = json.loads((Path(directory) / 'ledger-receipt.json').read_text())
    root = Path(directory) / 'erasure-ledger'
    root.mkdir(exist_ok=True, mode=0o700)
    digest = hashlib.sha256()
    count = 0
    for entry in sorted(root.iterdir()):
        if entry.is_symlink() or not entry.is_file():
            raise ValueError('Invalid local erasure ledger')
        raw = entry.read_bytes()
        record = json.loads(raw)
        if record.get('schema') != 1 or record.get('userId', '') + '.json' != entry.name:
            raise ValueError('Invalid erasure ledger identity')
        digest.update(entry.name.encode() + b'\0' + hashlib.sha256(raw).digest())
        count += 1
    if receipt != {'schema': 1, 'entries': count, 'sha256': digest.hexdigest()} or (expected and receipt['sha256'] != expected):
        raise ValueError('Erasure ledger receipt mismatch')
    return receipt


def run_json(command, cwd=None):
    result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=600)
    if result.returncode:
        raise ValueError('Isolated recovery verification failed')
    return json.loads(result.stdout)


def rehearse(config, archive, ledger_archive, expected_ledger):
    with tempfile.TemporaryDirectory(prefix='restore-', dir=config['stateDirectory']) as temporary:
        target = Path(temporary)
        backup = target / 'backup'
        latest = target / 'latest'
        backup.mkdir(mode=0o700)
        latest.mkdir(mode=0o700)
        decrypt_extract(config, archive, backup)
        decrypt_extract(config, ledger_archive, latest)
        validate_ledger(backup)
        ledger = validate_ledger(latest, expected_ledger)
        receipt = run_json([config['node'], config['restoreChecker'], str(backup / 'snapshot')])
        # A recovered runtime needs the current ledger beside its database too;
        # replaying from an external directory alone would leave future backups
        # with stale deletion markers. This tree is a disposable private copy.
        runtime_ledger = backup / 'snapshot' / 'deletion-ledger'
        if runtime_ledger.exists():
            shutil.rmtree(runtime_ledger)
        shutil.copytree(latest / 'erasure-ledger', runtime_ledger)
        replay = run_json([config['node'], config['erasureReplay'], '--replay', '--data', str(backup / 'snapshot'), '--ledger', str(runtime_ledger)], config['repository'])
        return {'checkedAt': utc_now(), 'snapshot': receipt, 'erasureReplay': replay, 'ledger': ledger, 'currentLedgerInstalled': True, 'productionChanged': False}


def ssh_command(config, mode, name=None):
    import re
    if config['sshHost'] != 'codex-keen-forge-bf65':
        raise ValueError('This configuration is scoped to the dedicated VergeCommon server')
    if name and not re.fullmatch(r'[0-9TZ-]+-[A-Za-z0-9]+', name):
        raise ValueError('Invalid remote snapshot name')
    return ['/usr/bin/ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2', config['sshHost'], 'python3 - ' + mode + (' ' + name if name else '')]


def remote_inspect(config):
    result = subprocess.run(ssh_command(config, 'inspect'), input=(HERE / 'operations_remote.py').read_bytes(), capture_output=True, timeout=60)
    if result.returncode:
        raise ValueError('Server operational check failed')
    return json.loads(result.stdout)


def pull_archive(config, mode, name, path):
    temporary = path.with_name(path.name + '.partial')
    process = subprocess.Popen(ssh_command(config, mode, name if mode == 'snapshot' else None), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        process.stdin.write((HERE / 'operations_remote.py').read_bytes())
        process.stdin.close()
        encrypt_stream(config, process.stdout, temporary)
        if process.wait(timeout=60):
            raise ValueError('Server archive transfer failed')
        os.replace(temporary, path)
    except Exception:
        process.kill()
        process.wait()
        temporary.unlink(missing_ok=True)
        raise
    finally:
        process.stdout.close()


def freshness(created_at, maximum_hours=30, now=None):
    created = datetime.fromisoformat(created_at.replace('Z', '+00:00')).timestamp()
    age = (time.time() if now is None else now) - created
    return -300 <= age <= maximum_hours * 3600


def run(config):
    os.umask(0o077)
    state = private_path(config['stateDirectory'], directory=True)
    destination = private_path(config['destination'], directory=True)
    private_path(config['keyFile'])
    if Path(config['keyFile']).resolve().is_relative_to(destination.resolve()):
        raise ValueError('Recovery key must be separate from the backup destination')
    with open(state / 'run.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'status': 'already_running'}
        # A killed rehearsal may leave its private plaintext working directory.
        # Only this tool's restricted, named temporary trees are eligible here.
        for leftover in state.glob('restore-*'):
            if re.fullmatch(r'restore-[a-z0-9_]{8}', leftover.name):
                private_path(leftover, directory=True)
                shutil.rmtree(leftover)
        status = {'schema': 1, 'checkedAt': utc_now(), 'status': 'failed', 'problems': [], 'notificationDelivery': 'local receipts only'}
        try:
            try:
                with urllib.request.urlopen('https://vergecommon.com/healthz', timeout=20) as response:
                    health = json.load(response)
                    if health.get('status') != 'ok' or health.get('service') != 'vergecommon':
                        raise ValueError('Public health check failed')
            except Exception:
                status['problems'].append('Public HTTPS health check failed')
            remote = remote_inspect(config)
            status['remote'] = remote
            if not remote['containerHealthy']:
                status['problems'].append('App container health is not healthy')
            if remote['disk']['used'] / remote['disk']['total'] >= 0.85:
                status['problems'].append('Server disk is at least 85% full')
            if not freshness(remote['snapshot']['createdAt'], config.get('maximumBackupAgeHours', 30)):
                status['problems'].append('Server backup is older than the 30-hour recovery target')
            if not remote['erasureLedger']['available']:
                raise ValueError('Live erasure ledger must be deployed before recovery can be qualified')
            if shutil.disk_usage(destination).free < config.get('minimumLocalFreeBytes', 5_000_000_000):
                raise ValueError('Mac has insufficient free space for recovery rehearsal')
            snapshot = destination / ('snapshot-' + remote['snapshot']['name'] + '.tar.gz.gpg')
            ledger = destination / ('ledger-' + remote['erasureLedger']['sha256'] + '.tar.gz.gpg')
            for mode, path, name in [('snapshot', snapshot, remote['snapshot']['name']), ('ledger', ledger, None)]:
                if not path.exists():
                    pull_archive(config, mode, name, path)
                private_path(path)
            recovery = rehearse(config, snapshot, ledger, remote['erasureLedger']['sha256'])
            # A changing live ledger invalidates this check; retry on the next run.
            after = remote_inspect(config)
            if after['erasureLedger'] != remote['erasureLedger']:
                raise ValueError('Erasure ledger changed during verification; rerun required')
            status.update({'status': 'healthy' if not status['problems'] else 'attention', 'archive': str(snapshot), 'archiveSha256': digest_file(snapshot), 'latestLedgerArchive': str(ledger), 'ledgerArchiveSha256': digest_file(ledger), 'recovery': recovery, 'completedAt': utc_now()})
            save_json(state / 'last-success.json', status)
        except Exception as error:
            # Only our bounded operational messages enter the receipt.
            status['problems'].append(str(error) if isinstance(error, ValueError) else type(error).__name__)
        save_json(state / 'status.json', status)
        return status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--status', action='store_true', help='Read status and detect a stopped/sleeping scheduler without networking')
    args = parser.parse_args()
    config = json.loads(private_path(args.config).read_text())
    if args.status:
        status_path = Path(config['stateDirectory']) / 'status.json'
        status = json.loads(status_path.read_text()) if status_path.exists() else {'status': 'missing', 'problems': ['No operational check has completed']}
        if status.get('checkedAt') and not freshness(status['checkedAt'], 2):
            status['status'] = 'stale'
            status.setdefault('problems', []).append('Mac operational check is older than two hours; it may be asleep, offline or stopped')
    else:
        status = run(config)
    print(json.dumps(status, indent=2))
    return 0 if status['status'] in ('healthy', 'already_running') else 1


if __name__ == '__main__':
    sys.exit(main())
