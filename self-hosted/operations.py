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
import urllib.parse
import uuid

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


PROBLEMS = {
    'PUBLIC_HEALTH_FAILED': 'Public HTTPS health check failed',
    'REMOTE_INSPECTION_FAILED': 'Server operational inspection failed',
    'CONTAINER_UNHEALTHY': 'App container health is not healthy',
    'DISK_HIGH': 'Server disk use exceeds the configured threshold',
    'BACKUP_MISSING': 'No completed server backup is available',
    'BACKUP_STALE': 'Server backup is older than the configured recovery target',
    'ERASURE_LEDGER_UNAVAILABLE': 'Live deletion ledger is unavailable or incomplete',
    'CAPACITY_UNAVAILABLE': 'Read-only capacity totals are unavailable',
    'DATABASE_HIGH': 'Database and journal size exceeds the configured threshold',
    'EVIDENCE_STORAGE_HIGH': 'Private evidence storage exceeds the configured threshold',
    'BACKUP_STORAGE_HIGH': 'Server backup storage exceeds the configured threshold',
    'WORKSPACE_FILES_HIGH': 'A co-op is approaching the evidence file limit',
    'WORKSPACE_MEMBERS_HIGH': 'A co-op is approaching the member record limit',
    'FILE_CLEANUP_PENDING': 'Private file cleanup remains queued',
    'SAFETY_QUEUE_UNAVAILABLE': 'Operator report queue totals are unavailable',
    'SAFETY_QUEUE_HIGH': 'Open operator reports exceed the configured threshold',
    'SAFETY_REPORT_OVERDUE': 'An open operator report exceeds the response-age target',
    'LOCAL_SPACE_LOW': 'Local free space is insufficient for the recovery rehearsal',
    'ARCHIVE_TRANSFER_FAILED': 'Encrypted backup transfer failed',
    'RECOVERY_REHEARSAL_FAILED': 'Isolated recovery verification failed',
    'LEDGER_CHANGED': 'Deletion ledger changed during recovery verification',
    'CONFIGURATION_INVALID': 'Operational configuration is invalid',
    'NOTIFICATION_DELIVERY_FAILED': 'Configured notification delivery failed',
}


def add_problem(status, code):
    if code not in PROBLEMS:
        code = 'CONFIGURATION_INVALID'
    if code not in status['problemCodes']:
        status['problemCodes'].append(code)
        status['problems'].append(PROBLEMS[code])


def threshold(config, name, default):
    value = config.get('thresholds', {}).get(name, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 < value < float('inf'):
        raise ValueError('Invalid operational threshold')
    return value


def remote_problem_codes(remote, config, now=None):
    codes = []
    if not remote.get('containerHealthy'):
        codes.append('CONTAINER_UNHEALTHY')
    disk = remote.get('disk', {})
    if not disk.get('total') or disk.get('used', 0) / disk['total'] >= threshold(config, 'diskUsedFraction', .85):
        codes.append('DISK_HIGH')
    snapshot = remote.get('snapshot', {})
    if not snapshot.get('createdAt') or snapshot.get('available') is False:
        codes.append('BACKUP_MISSING')
    elif not freshness(snapshot['createdAt'], config.get('maximumBackupAgeHours', 30), now=now):
        codes.append('BACKUP_STALE')
    if not remote.get('erasureLedger', {}).get('available'):
        codes.append('ERASURE_LEDGER_UNAVAILABLE')
    capacity = remote.get('capacity', {})
    if not capacity.get('available'):
        codes.append('CAPACITY_UNAVAILABLE')
    else:
        for value, setting, default, code in [
            (capacity['databaseBytes'] + capacity['walBytes'], 'databaseBytes', 1_000_000_000, 'DATABASE_HIGH'),
            (capacity['evidence']['bytes'], 'evidenceBytes', 5_000_000_000, 'EVIDENCE_STORAGE_HIGH'),
            (capacity['backups']['bytes'], 'backupBytes', 10_000_000_000, 'BACKUP_STORAGE_HIGH'),
            (capacity['maxWorkspaceFiles'], 'workspaceFiles', 180, 'WORKSPACE_FILES_HIGH'),
            (capacity['maxWorkspaceMembers'], 'workspaceMembers', 450, 'WORKSPACE_MEMBERS_HIGH'),
        ]:
            if value >= threshold(config, setting, default):
                codes.append(code)
        if capacity.get('pendingEvidenceDeletions') or capacity.get('pendingErasureFiles'):
            codes.append('FILE_CLEANUP_PENDING')
    safety = remote.get('safetyQueue', {})
    if not safety.get('available'):
        codes.append('SAFETY_QUEUE_UNAVAILABLE')
    else:
        if safety['openReports'] >= threshold(config, 'openSafetyReports', 50):
            codes.append('SAFETY_QUEUE_HIGH')
        if safety['openReports'] and safety['oldestOpenAgeSeconds'] >= threshold(config, 'safetyReportAgeHours', 24) * 3600:
            codes.append('SAFETY_REPORT_OVERDUE')
    return sorted(codes)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def webhook_post(url, payload, event_id, timeout):
    request = urllib.request.Request(url, data=json.dumps(payload, sort_keys=True).encode(), method='POST',
                                     headers={'Content-Type': 'application/json', 'Idempotency-Key': event_id,
                                              'User-Agent': 'VergeCommon-Operations/1'})
    # TLS verification stays enabled. Redirects cannot move the configured
    # webhook secret or payload to a different destination.
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=timeout) as response:
        if not 200 <= response.status < 300:
            raise ValueError('Notification was not accepted')


def deliver_notification(config, status, state, transport=webhook_post):
    """Opt-in, redacted, transition-only delivery with durable retry identity."""
    settings = config.get('notifications', {})
    if not isinstance(settings, dict):
        return {'status': 'failed', 'problemCode': 'NOTIFICATION_DELIVERY_FAILED'}
    if settings.get('enabled') is not True:
        return {'status': 'disabled'}
    try:
        url = settings['webhookUrl']
        parsed = urllib.parse.urlsplit(url)
        timeout = settings.get('timeoutSeconds', 10)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.fragment or any(c.isspace() for c in url):
            raise ValueError('Invalid webhook destination')
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 1 <= timeout <= 30:
            raise ValueError('Invalid webhook timeout')
        normalized_status = status['status'] if status['status'] in ('healthy', 'attention', 'failed') else 'failed'
        codes = sorted({code for code in status.get('problemCodes', []) if code in PROBLEMS and code != 'NOTIFICATION_DELIVERY_FAILED'})
        if normalized_status != 'healthy' and not codes:
            codes = ['REMOTE_INSPECTION_FAILED']
        payload = {'schema': 1, 'service': 'vergecommon', 'event': 'recovery' if normalized_status == 'healthy' else 'failure',
                   'status': normalized_status, 'problemCodes': codes}
        fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        destination_hash = hashlib.sha256(url.encode()).hexdigest()
        receipt_path = Path(state) / 'notification-state.json'
        receipt = json.loads(private_path(receipt_path).read_text()) if receipt_path.exists() else {}
        if receipt.get('destinationHash') != destination_hash:
            receipt = {'destinationHash': destination_hash}
        if receipt.get('deliveredFingerprint') == fingerprint and not receipt.get('pending'):
            return {'status': 'unchanged'}
        if normalized_status == 'healthy' and receipt.get('deliveredStatus') not in ('failed', 'attention') and not receipt.get('pending'):
            # Stay quiet initially. A pending timed-out alert may have reached
            # the receiver, so a later recovery still needs a corrective event.
            save_json(receipt_path, {'destinationHash': destination_hash, 'deliveredStatus': 'healthy', 'deliveredFingerprint': fingerprint})
            return {'status': 'healthy_baseline'}
        pending = receipt.get('pending', {})
        event_id = pending.get('eventId') if pending.get('fingerprint') == fingerprint else str(uuid.uuid4())
        receipt['pending'] = {'fingerprint': fingerprint, 'eventId': event_id}
        save_json(receipt_path, receipt)
        transport(url, payload, event_id, timeout)
        save_json(receipt_path, {'destinationHash': destination_hash, 'deliveredStatus': normalized_status,
                                 'deliveredFingerprint': fingerprint, 'deliveredAt': utc_now()})
        return {'status': 'delivered', 'event': payload['event']}
    except Exception:
        # Provider exception text can contain the URL/token. Never persist it.
        return {'status': 'failed', 'problemCode': 'NOTIFICATION_DELIVERY_FAILED'}


def retention_plan(destination, keep_days, keep_at_least, now=None):
    """List candidates only. Ledger archives and unrecognized entries are held."""
    if isinstance(keep_days, bool) or not isinstance(keep_days, int) or keep_days < 1 or isinstance(keep_at_least, bool) or not isinstance(keep_at_least, int) or keep_at_least < 2:
        raise ValueError('Choose at least one retention day and at least two retained snapshots')
    destination = private_path(destination, directory=True)
    current = time.time() if now is None else now
    snapshots, held = [], []
    pattern = re.compile(r'^snapshot-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-[A-Za-z0-9]+\.tar\.gz\.gpg$')
    for path in sorted(destination.iterdir()):
        match = pattern.fullmatch(path.name)
        if not match or path.is_symlink() or not path.is_file():
            held.append({'name': path.name, 'reason': 'ledger_or_unrecognized_entry'})
            continue
        try:
            created = datetime.strptime(match[1], '%Y-%m-%dT%H-%M-%S-%fZ').replace(tzinfo=timezone.utc).timestamp()
        except ValueError:
            held.append({'name': path.name, 'reason': 'invalid_snapshot_timestamp'})
            continue
        snapshots.append({'name': path.name, 'createdAt': created, 'bytes': path.stat().st_size})
    snapshots.sort(key=lambda item: (item['createdAt'], item['name']), reverse=True)
    candidates = []
    for index, item in enumerate(snapshots):
        if index >= keep_at_least and item['createdAt'] < current - keep_days * 86400:
            candidates.append(item)
        else:
            held.append({'name': item['name'], 'reason': 'newest_minimum_or_within_retention_window'})
    return {'schema': 1, 'mode': 'plan_only', 'filesDeleted': 0, 'policy': {'keepDays': keep_days, 'keepAtLeast': keep_at_least},
            'candidateBytes': sum(item['bytes'] for item in candidates), 'candidates': candidates, 'held': held,
            'requiresBeforeDeletion': ['Explicit owner retention approval', 'Verified independent recovery copy', 'Latest independently retained deletion ledger', 'Any preservation requirement review']}


def run(config, check_only=False):
    os.umask(0o077)
    state = private_path(config['stateDirectory'], directory=True)
    with open(state / 'run.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'status': 'already_running'}
        status = {'schema': 1, 'checkedAt': utc_now(), 'status': 'failed', 'problems': [], 'problemCodes': [],
                  'mode': 'inspection_only' if check_only else 'encrypted_recovery', 'productionChanged': False}
        phase = 'CONFIGURATION_INVALID'
        try:
            try:
                with urllib.request.urlopen('https://vergecommon.com/healthz', timeout=20) as response:
                    health = json.load(response)
                    if health.get('status') != 'ok' or health.get('service') != 'vergecommon':
                        raise ValueError('Public health check failed')
            except Exception:
                add_problem(status, 'PUBLIC_HEALTH_FAILED')
            phase = 'REMOTE_INSPECTION_FAILED'
            remote = remote_inspect(config)
            status['remote'] = remote
            phase = 'CONFIGURATION_INVALID'
            for code in remote_problem_codes(remote, config):
                add_problem(status, code)
            if check_only:
                status.update({'status': 'healthy' if not status['problems'] else 'attention', 'completedAt': utc_now(), 'archiveTransferPerformed': False})
            else:
                destination = private_path(config['destination'], directory=True)
                private_path(config['keyFile'])
                if Path(config['keyFile']).resolve().is_relative_to(destination.resolve()):
                    raise ValueError('Recovery key must be separate from the backup destination')
                # Cleanup is limited to this tool's private rehearsal directories.
                for leftover in state.glob('restore-*'):
                    if re.fullmatch(r'restore-[a-z0-9_]{8}', leftover.name):
                        private_path(leftover, directory=True)
                        shutil.rmtree(leftover)
                phase = 'BACKUP_MISSING'
                if not remote['snapshot'].get('createdAt'):
                    raise ValueError('No completed backup')
                phase = 'ERASURE_LEDGER_UNAVAILABLE'
                if not remote['erasureLedger']['available']:
                    raise ValueError('Incomplete deletion ledger')
                phase = 'LOCAL_SPACE_LOW'
                if shutil.disk_usage(destination).free < config.get('minimumLocalFreeBytes', 5_000_000_000):
                    raise ValueError('Insufficient local space')
                snapshot = destination / ('snapshot-' + remote['snapshot']['name'] + '.tar.gz.gpg')
                ledger = destination / ('ledger-' + remote['erasureLedger']['sha256'] + '.tar.gz.gpg')
                phase = 'ARCHIVE_TRANSFER_FAILED'
                for mode, path, name in [('snapshot', snapshot, remote['snapshot']['name']), ('ledger', ledger, None)]:
                    if not path.exists():
                        pull_archive(config, mode, name, path)
                    private_path(path)
                phase = 'RECOVERY_REHEARSAL_FAILED'
                recovery = rehearse(config, snapshot, ledger, remote['erasureLedger']['sha256'])
                phase = 'REMOTE_INSPECTION_FAILED'
                after = remote_inspect(config)
                phase = 'LEDGER_CHANGED'
                if after['erasureLedger'] != remote['erasureLedger']:
                    raise ValueError('Deletion ledger changed')
                status.update({'status': 'healthy' if not status['problems'] else 'attention', 'archive': str(snapshot), 'archiveSha256': digest_file(snapshot),
                               'latestLedgerArchive': str(ledger), 'ledgerArchiveSha256': digest_file(ledger), 'recovery': recovery, 'completedAt': utc_now()})
                save_json(state / 'last-success.json', status)
        except Exception:
            add_problem(status, phase)
        status['notificationDelivery'] = deliver_notification(config, status, state)
        if status['notificationDelivery']['status'] == 'failed':
            add_problem(status, 'NOTIFICATION_DELIVERY_FAILED')
            if status['status'] == 'healthy':
                status['status'] = 'attention'
        save_json(state / ('inspection-status.json' if check_only else 'status.json'), status)
        return status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--status', action='store_true', help='Read recovery status without networking')
    mode.add_argument('--check-only', action='store_true', help='Read health and aggregate counts without copying backups or reading the recovery key')
    mode.add_argument('--retention-plan', action='store_true', help='Preview local encrypted snapshot candidates; never deletes files or contacts the server')
    parser.add_argument('--keep-days', type=int)
    parser.add_argument('--keep-at-least', type=int)
    args = parser.parse_args()
    config = json.loads(private_path(args.config).read_text())
    if args.retention_plan:
        if args.keep_days is None or args.keep_at_least is None:
            parser.error('--retention-plan requires --keep-days and --keep-at-least')
        print(json.dumps(retention_plan(config['destination'], args.keep_days, args.keep_at_least), indent=2))
        return 0
    if args.keep_days is not None or args.keep_at_least is not None:
        parser.error('Retention settings require --retention-plan')
    if args.status:
        status_path = Path(config['stateDirectory']) / 'status.json'
        status = json.loads(status_path.read_text()) if status_path.exists() else {'status': 'missing', 'problems': ['No operational check has completed']}
        if status.get('checkedAt') and not freshness(status['checkedAt'], 2):
            status['status'] = 'stale'
            status.setdefault('problems', []).append('Mac operational check is older than two hours; it may be asleep, offline or stopped')
    else:
        status = run(config, check_only=args.check_only)
    print(json.dumps(status, indent=2))
    return 0 if status['status'] in ('healthy', 'already_running') else 1


if __name__ == '__main__':
    sys.exit(main())
