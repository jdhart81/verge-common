"""Isolated operational protection tests. No production SSH, schedules or secrets."""
from datetime import datetime, timezone
import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import shutil
import sqlite3
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


ops = module('operations', ROOT / 'self-hosted/operations.py')
remote = module('operations_remote', ROOT / 'self-hosted/operations_remote.py')
installer = module('install_operations', ROOT / 'self-hosted/install-mac-operations.py')


def archive_bytes(name='snapshot/receipt.json', data=b'{}', link=None):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as archive:
        item = tarfile.TarInfo(name)
        item.size = len(data) if link is None else 0
        if link is not None:
            item.type = tarfile.SYMTYPE
            item.linkname = link
        archive.addfile(item, io.BytesIO(data) if link is None else None)
    return output.getvalue()


class OperationsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='verge-ops-test-', dir='/tmp')
        self.root = Path(self.temp.name)
        self.old_mask = os.umask(0o077)
        remote.DATABASE = self.root / 'live.sqlite'
        with sqlite3.connect(remote.DATABASE) as database:
            database.execute('CREATE TABLE erasure_tombstones (user_id TEXT PRIMARY KEY)')

    def tearDown(self):
        os.umask(self.old_mask)
        self.temp.cleanup()

    def test_extraction_refuses_escape_links_duplicates_and_oversize(self):
        for index, raw in enumerate([archive_bytes('../escape'), archive_bytes('/absolute'), archive_bytes('snapshot/link', link='/etc/passwd'), archive_bytes('unexpected/root')]):
            target = self.root / str(index)
            target.mkdir()
            with self.assertRaises(ValueError):
                ops.extract_stream(io.BytesIO(raw), target)
        with self.assertRaises(ValueError):
            ops.extract_stream(io.BytesIO(archive_bytes(data=b'a' * 100)), self.root / 'size', maximum_bytes=50)
        destination = self.root / 'valid'
        destination.mkdir()
        ops.extract_stream(io.BytesIO(archive_bytes()), destination)
        with self.assertRaises(FileExistsError):
            ops.extract_stream(io.BytesIO(archive_bytes()), destination)
        self.assertEqual((destination / 'snapshot/receipt.json').read_bytes(), b'{}')

    def test_real_gpg_round_trip_rejects_tampering_and_wrong_key(self):
        gpg = shutil.which('gpg')
        self.assertIsNotNone(gpg, 'GnuPG is required for operational encryption tests')
        key = self.root / 'key'
        key.write_text('synthetic-test-only-' * 5)
        home = self.root / 'gnupg'
        home.mkdir()
        config = {'gpg': gpg, 'gpgHome': str(home), 'keyFile': str(key)}
        encrypted = self.root / 'snapshot.gpg'
        raw = archive_bytes(data=b'{"synthetic":true}')
        source = self.root / 'source.tar.gz'
        source.write_bytes(raw)
        with source.open('rb') as incoming:
            ops.encrypt_stream(config, incoming, encrypted)
        target = self.root / 'roundtrip'
        target.mkdir()
        ops.decrypt_extract(config, encrypted, target)
        self.assertEqual((target / 'snapshot/receipt.json').read_bytes(), b'{"synthetic":true}')
        tampered = bytearray(encrypted.read_bytes())
        tampered[-5] ^= 0x80
        changed = self.root / 'changed.gpg'
        changed.write_bytes(tampered)
        with self.assertRaises((ValueError, tarfile.TarError, EOFError)):
            ops.decrypt_extract(config, changed, self.root / 'bad')
        key.write_text('different-synthetic-test-key-' * 5)
        with self.assertRaises((ValueError, tarfile.TarError, EOFError)):
            ops.decrypt_extract(config, encrypted, self.root / 'wrong')

    def test_permissions_reject_exposed_or_symlink_key(self):
        key = self.root / 'key'
        key.write_text('synthetic')
        key.chmod(0o644)
        with self.assertRaises(ValueError):
            ops.private_path(key)
        key.chmod(0o600)
        alias = self.root / 'alias'
        alias.symlink_to(key)
        with self.assertRaises(ValueError):
            ops.private_path(alias)
        self.assertEqual(ops.private_path(key), key)

    def test_ledger_requires_committed_entries_and_matching_receipt(self):
        root = self.root / 'erasure-ledger'
        root.mkdir()
        user = 'b9709429-36f3-4c03-8711-1e1214a21e43'
        raw = json.dumps({'schema': 1, 'userId': user, 'requestedAt': 123}).encode()
        (root / (user + '.json')).write_bytes(raw)
        remote.LEDGER = root
        entries = remote.ledger_entries()
        receipt = {'schema': 1, 'entries': 1, 'sha256': remote.ledger_digest(entries)}
        (self.root / 'ledger-receipt.json').write_text(json.dumps(receipt))
        self.assertEqual(ops.validate_ledger(self.root), receipt)
        (root / (user + '.pending')).write_bytes(raw)
        with self.assertRaises(ValueError):
            remote.ledger_entries()
        with self.assertRaises(ValueError):
            ops.validate_ledger(self.root)

    def test_freshness_flags_stopped_scheduler_old_backup_and_future_clock(self):
        stamp = datetime.fromtimestamp(1000000, timezone.utc).isoformat()
        self.assertTrue(ops.freshness(stamp, 30, now=1000001))
        self.assertFalse(ops.freshness(stamp, 30, now=1000000 + 31 * 3600))
        self.assertFalse(ops.freshness(stamp, 2, now=1000000 + 3 * 3600))
        self.assertFalse(ops.freshness(stamp, 30, now=999000))

    def test_live_ledger_loss_fails_closed_without_modifying_database(self):
        root = self.root / 'erasure-ledger'
        root.mkdir()
        remote.LEDGER = root
        user = 'b9709429-36f3-4c03-8711-1e1214a21e43'
        with sqlite3.connect(remote.DATABASE) as database:
            database.execute('INSERT INTO erasure_tombstones VALUES (?)', (user,))
        original = remote.DATABASE.read_bytes()
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            remote.ledger_entries()
        (root / (user + '.json')).write_text(json.dumps({'schema': 1, 'userId': user, 'requestedAt': 123}))
        self.assertEqual(len(remote.ledger_entries()), 1)
        self.assertEqual(remote.DATABASE.read_bytes(), original)
        remote.DATABASE = self.root / 'missing.sqlite'
        with self.assertRaisesRegex(ValueError, 'unavailable'):
            remote.ledger_entries()
        self.assertFalse(remote.DATABASE.exists())

    def test_installer_preserves_key_and_has_explicit_hourly_arguments(self):
        destination = self.root / 'Desktop/Cowork /Vergecommon/private-backups/encrypted'
        result = installer.install(ROOT, '/usr/bin/false', '/usr/bin/python3', '/usr/bin/false', destination, home=self.root, load=False)
        first_key = Path(result['keyFile']).read_bytes()
        again = installer.install(ROOT, '/usr/bin/false', '/usr/bin/python3', '/usr/bin/false', destination, home=self.root, load=False)
        self.assertEqual(Path(again['keyFile']).read_bytes(), first_key)
        self.assertGreaterEqual(len(first_key), 64)
        agent = plistlib.loads(Path(result['agent']).read_bytes())
        self.assertEqual(agent['StartInterval'], 3600)
        self.assertTrue(agent['RunAtLoad'])
        self.assertIn('--config', agent['ProgramArguments'])
        self.assertNotIn(first_key.decode().strip(), json.dumps(result))
        self.assertFalse(Path(result['keyFile']).is_relative_to(destination))
        with self.assertRaises(ValueError):
            installer.install(ROOT, '/usr/bin/false', '/usr/bin/python3', '/usr/bin/false', self.root / 'other', home=self.root, load=False)


if __name__ == '__main__':
    unittest.main()
