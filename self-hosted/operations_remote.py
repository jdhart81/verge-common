"""Read-only snapshot/erasure-ledger transport over the owner's authenticated SSH."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import time
import stat

BACKUPS = Path('/opt/vergecommon/backups')
LEDGER = Path('/opt/vergecommon/data/deletion-ledger')
DATABASE = Path('/opt/vergecommon/data/vergecommon.sqlite')
EVIDENCE = Path('/opt/vergecommon/data/evidence')
NAME = re.compile(r'^[0-9TZ-]+-[A-Za-z0-9]+$')
ENTRY = re.compile(r'^[a-f0-9-]{36}\.json$')


def ledger_entries():
    if not LEDGER.is_dir() or LEDGER.is_symlink():
        raise ValueError('Live erasure ledger is unavailable')
    entries = []
    for path in sorted(LEDGER.iterdir()):
        if not ENTRY.fullmatch(path.name) or not path.is_file() or path.is_symlink():
            raise ValueError('Unexpected erasure ledger entry')
        raw = path.read_bytes()
        record = json.loads(raw)
        if record.get('schema') != 1 or record.get('userId') + '.json' != path.name:
            raise ValueError('Invalid erasure ledger entry')
        entries.append((path.name, raw))
    # An existing but emptied/partially lost directory must not turn an old
    # pre-deletion snapshot into an apparently valid recovery point. This is a
    # read-only live-database check; opaque account IDs never enter receipts.
    if not DATABASE.is_file() or DATABASE.is_symlink():
        raise ValueError('Live deletion state is unavailable')
    database = sqlite3.connect(DATABASE.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        committed = {row[0] + '.json' for row in database.execute('SELECT user_id FROM erasure_tombstones')}
    finally:
        database.close()
    if not committed.issubset({name for name, _ in entries}):
        raise ValueError('Live erasure ledger is incomplete')
    return entries


def ledger_digest(entries):
    digest = hashlib.sha256()
    for name, raw in entries:
        digest.update(name.encode() + b'\0' + hashlib.sha256(raw).digest())
    return digest.hexdigest()


def snapshot(name=None):
    candidates = []
    for path in BACKUPS.iterdir():
        if not NAME.fullmatch(path.name) or not path.is_dir() or path.is_symlink():
            continue
        if name is not None and path.name != name:
            continue
        try:
            receipt_path = path / 'receipt.json'
            if receipt_path.is_symlink():
                continue
            receipt = json.loads(receipt_path.read_text())
            if receipt.get('databaseIntegrity') != 'ok' or not re.fullmatch(r'[a-f0-9]{64}', receipt.get('databaseSha256', '')):
                continue
            candidates.append((path, receipt))
        except (OSError, ValueError):
            continue
    if not candidates:
        raise ValueError('No completed backup is available')
    return max(candidates, key=lambda item: item[1]['createdAt'])


def tree_usage(root, maximum_entries=250000):
    """Count regular bytes without opening private contents or following links."""
    if not root.is_dir() or root.is_symlink():
        raise ValueError('Storage inventory unavailable')
    total = files = entries = 0
    for directory, subdirectories, filenames in os.walk(root, followlinks=False):
        for name in subdirectories + filenames:
            entries += 1
            if entries > maximum_entries:
                raise ValueError('Storage inventory limit exceeded')
            info = (Path(directory) / name).lstat()
            if stat.S_ISLNK(info.st_mode) or not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
                raise ValueError('Storage inventory contains unsupported entries')
            if stat.S_ISREG(info.st_mode):
                total += info.st_size
                files += 1
    return {'bytes': total, 'files': files}


def database_summary(now=None):
    """Only aggregates leave this read-only connection, never report contents."""
    if not DATABASE.is_file() or DATABASE.is_symlink():
        raise ValueError('Live database unavailable')
    now = time.time() if now is None else now
    database = sqlite3.connect(DATABASE.resolve().as_uri() + '?mode=ro', uri=True, timeout=5)
    try:
        database.execute('PRAGMA query_only=ON')
        # Bound pathological/corrupt aggregate scans rather than holding a reader.
        deadline = time.monotonic() + 5
        database.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
        tables = {row[0] for row in database.execute("SELECT name FROM sqlite_schema WHERE type='table'")}
        capacity = {
            'workspaceCount': database.execute('SELECT count(*) FROM workspaces').fetchone()[0],
            'assetCount': database.execute('SELECT count(*) FROM assets').fetchone()[0],
            'maxWorkspaceFiles': database.execute('SELECT coalesce(max(n),0) FROM (SELECT count(*) AS n FROM assets GROUP BY workspace_id)').fetchone()[0],
            'maxWorkspaceMembers': database.execute("SELECT coalesce(max(json_array_length(state_json,'$.members')),0) FROM workspaces").fetchone()[0],
            'pendingEvidenceDeletions': database.execute('SELECT count(*) FROM evidence_file_deletions').fetchone()[0] if 'evidence_file_deletions' in tables else None,
            'pendingErasureFiles': database.execute('SELECT count(*) FROM erasure_file_queue').fetchone()[0] if 'erasure_file_queue' in tables else None,
        }
        safety = {'available': False}
        if 'safety_reports' in tables:
            count, oldest = database.execute("SELECT count(*),min(created_at) FROM safety_reports WHERE status IN ('received','reviewing')").fetchone()
            safety = {'available': True, 'openReports': count, 'oldestOpenAgeSeconds': max(0, now - oldest / 1000) if oldest is not None else 0}
        return capacity, safety
    finally:
        database.close()


def inspect():
    try:
        path, receipt = snapshot()
        latest = {'available': True, 'name': path.name, **receipt}
    except (OSError, ValueError):
        latest = {'available': False}
    disk = shutil.disk_usage(DATABASE.parent)
    health = subprocess.run(['docker', 'inspect', '--format', '{{.State.Health.Status}}', 'vergecommon-app'], capture_output=True, text=True, timeout=10)
    try:
        entries = ledger_entries()
        ledger = {'available': True, 'entries': len(entries), 'sha256': ledger_digest(entries)}
    except ValueError:
        ledger = {'available': False}
    try:
        capacity, safety = database_summary()
    except (OSError, ValueError, sqlite3.Error):
        capacity, safety = {'available': False}, {'available': False}
    try:
        if capacity.get('available') is False:
            raise ValueError('Database capacity unavailable')
        evidence = tree_usage(EVIDENCE) if EVIDENCE.exists() else {'bytes': 0, 'files': 0}
        if not EVIDENCE.exists() and capacity['assetCount']:
            raise ValueError('Evidence directory missing')
        capacity.update({'available': True, 'databaseBytes': DATABASE.stat().st_size,
                         'walBytes': Path(str(DATABASE) + '-wal').stat().st_size if Path(str(DATABASE) + '-wal').is_file() else 0,
                         'evidence': evidence, 'backups': tree_usage(BACKUPS)})
    except (OSError, ValueError, sqlite3.Error):
        capacity['available'] = False
    return {
        'snapshot': latest,
        'disk': {'total': disk.total, 'used': disk.used, 'free': disk.free},
        'containerHealthy': health.returncode == 0 and health.stdout.strip() == 'healthy',
        'erasureLedger': ledger,
        'capacity': capacity,
        'safetyQueue': safety,
    }


def archive(mode, name=None):
    import io
    entries = ledger_entries()
    with tarfile.open(fileobj=sys.stdout.buffer, mode='w|gz', dereference=False) as archive_file:
        if mode == 'snapshot':
            path, _ = snapshot(name)
            # Do not follow links or read special files into a recovery archive.
            for root, directories, files in os.walk(path, followlinks=False):
                for child in directories + files:
                    source = Path(root) / child
                    if source.is_symlink() or not (source.is_dir() or source.is_file()):
                        raise ValueError('Unsafe backup object')
            archive_file.add(path, arcname='snapshot', recursive=True)
        for entry_name, raw in entries:
            info = tarfile.TarInfo('erasure-ledger/' + entry_name)
            info.size = len(raw)
            info.mode = 0o600
            archive_file.addfile(info, io.BytesIO(raw))
        # Keep an empty ledger explicit; absence must never mean no erasures.
        marker = json.dumps({'schema': 1, 'entries': len(entries), 'sha256': ledger_digest(entries)}).encode()
        info = tarfile.TarInfo('ledger-receipt.json')
        info.size = len(marker)
        info.mode = 0o600
        archive_file.addfile(info, io.BytesIO(marker))


if __name__ == '__main__':
    try:
        mode = sys.argv[1]
        if mode == 'inspect':
            print(json.dumps(inspect()))
        elif mode in ('snapshot', 'ledger'):
            archive(mode, sys.argv[2] if mode == 'snapshot' else None)
        else:
            raise ValueError('Unsupported operation')
    except Exception:
        print('Remote backup read failed', file=sys.stderr)
        sys.exit(1)
