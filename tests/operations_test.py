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
from unittest import mock

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

    def test_notifications_default_disabled_and_reject_non_https_destinations(self):
        send = mock.Mock()
        status = {'status': 'failed', 'problemCodes': ['BACKUP_STALE']}
        self.assertEqual(ops.deliver_notification({}, status, self.root, send), {'status': 'disabled'})
        for url in ['http://example.test/secret', 'https://user:secret@example.test/', 'https://example.test/#secret', 'https://bad host.test/']:
            result = ops.deliver_notification({'notifications': {'enabled': True, 'webhookUrl': url}}, status, self.root, send)
            self.assertEqual(result['status'], 'failed')
        send.assert_not_called()
        self.assertFalse((self.root / 'notification-state.json').exists())

    def test_notifications_redact_dedupe_and_deliver_recovery_after_failure(self):
        config = {'notifications': {'enabled': True, 'webhookUrl': 'https://notify.example.test/private-token'}}
        send = mock.Mock()
        healthy = {'status': 'healthy', 'problemCodes': []}
        self.assertEqual(ops.deliver_notification(config, healthy, self.root, send)['status'], 'healthy_baseline')
        send.assert_not_called()
        failure = {'status': 'attention', 'problemCodes': ['BACKUP_STALE', 'unknown-secret'],
                   'problems': ['private user@example.test'], 'archive': '/private/records', 'remote': {'token': 'secret'}}
        self.assertEqual(ops.deliver_notification(config, failure, self.root, send)['status'], 'delivered')
        payload = send.call_args.args[1]
        self.assertEqual(payload, {'schema': 1, 'service': 'vergecommon', 'event': 'failure', 'status': 'attention', 'problemCodes': ['BACKUP_STALE']})
        first_event = send.call_args.args[2]
        self.assertEqual(ops.deliver_notification(config, failure, self.root, send)['status'], 'unchanged')
        self.assertEqual(send.call_count, 1)
        self.assertEqual(ops.deliver_notification(config, healthy, self.root, send)['event'], 'recovery')
        self.assertEqual(send.call_args.args[1]['problemCodes'], [])
        self.assertEqual(ops.deliver_notification(config, healthy, self.root, send)['status'], 'unchanged')
        ops.deliver_notification(config, failure, self.root, send)
        self.assertNotEqual(send.call_args.args[2], first_event, 'A new incident needs a new receiver dedupe identity')
        receipt = (self.root / 'notification-state.json').read_text()
        self.assertNotIn('private-token', receipt)
        self.assertNotIn('/private/records', receipt)

    def test_notification_failure_retries_same_event_without_persisting_provider_error(self):
        config = {'notifications': {'enabled': True, 'webhookUrl': 'https://notify.example.test/secret', 'timeoutSeconds': 3}}
        status = {'status': 'failed', 'problemCodes': ['PUBLIC_HEALTH_FAILED']}
        failing = mock.Mock(side_effect=TimeoutError('secret credentials in provider error'))
        self.assertEqual(ops.deliver_notification(config, status, self.root, failing)['status'], 'failed')
        event_id = failing.call_args.args[2]
        send = mock.Mock()
        self.assertEqual(ops.deliver_notification(config, status, self.root, send)['status'], 'delivered')
        self.assertEqual(send.call_args.args[2], event_id)
        self.assertEqual(send.call_args.args[3], 3)
        self.assertNotIn('credentials', (self.root / 'notification-state.json').read_text())
        self.assertEqual(ops.deliver_notification(config, status, self.root, send)['status'], 'unchanged')
        unconfirmed = self.root / 'unconfirmed'
        unconfirmed.mkdir()
        ops.deliver_notification(config, status, unconfirmed, failing)
        # A timeout may mean the receiver accepted the alert but lost its reply.
        result = ops.deliver_notification(config, {'status': 'healthy', 'problemCodes': []}, unconfirmed, send)
        self.assertEqual(result['event'], 'recovery')

    def test_webhook_checks_status_timeout_and_refuses_redirects(self):
        opener = mock.Mock()
        response = mock.MagicMock()
        response.__enter__.return_value.status = 503
        opener.open.return_value = response
        with mock.patch.object(ops.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaises(ValueError):
                ops.webhook_post('https://notify.example.test/', {'service': 'vergecommon'}, 'event-id', 4)
            response.__enter__.return_value.status = 202
            ops.webhook_post('https://notify.example.test/', {'service': 'vergecommon'}, 'event-id', 4)
        request = opener.open.call_args.args[0]
        self.assertEqual(opener.open.call_args.kwargs['timeout'], 4)
        self.assertEqual(request.get_method(), 'POST')
        self.assertEqual(request.get_header('Idempotency-key'), 'event-id')
        self.assertIsNone(ops.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.test/'))

    def test_capacity_and_safety_query_only_return_aggregates_and_do_not_change_database(self):
        with sqlite3.connect(remote.DATABASE) as database:
            database.executescript('CREATE TABLE workspaces (state_json TEXT); CREATE TABLE assets (workspace_id TEXT); CREATE TABLE safety_reports (status TEXT,created_at INTEGER,reason TEXT); CREATE TABLE evidence_file_deletions (object_key TEXT); CREATE TABLE erasure_file_queue (object_key TEXT);')
            database.execute('INSERT INTO workspaces VALUES (?)', (json.dumps({'members': [{'name': 'PRIVATE MEMBER'}]}),))
            database.execute('INSERT INTO assets VALUES (?)', ('PRIVATE WORKSPACE',))
            database.execute('INSERT INTO safety_reports VALUES (?,?,?)', ('received', 900000000, 'PRIVATE REPORT CONTENT'))
            database.execute('INSERT INTO safety_reports VALUES (?,?,?)', ('resolved', 1, 'CLOSED PRIVATE REPORT'))
        before = remote.DATABASE.read_bytes()
        capacity, safety = remote.database_summary(now=1000000)
        self.assertEqual(capacity['workspaceCount'], 1)
        self.assertEqual(capacity['maxWorkspaceFiles'], 1)
        self.assertEqual(capacity['maxWorkspaceMembers'], 1)
        self.assertEqual(safety, {'available': True, 'openReports': 1, 'oldestOpenAgeSeconds': 100000})
        self.assertNotIn('PRIVATE', json.dumps([capacity, safety]))
        self.assertEqual(before, remote.DATABASE.read_bytes())
        root = self.root / 'evidence'
        root.mkdir()
        (root / 'object').write_bytes(b'private contents')
        self.assertEqual(remote.tree_usage(root), {'bytes': 16, 'files': 1})
        (root / 'alias').symlink_to(remote.DATABASE)
        with self.assertRaises(ValueError):
            remote.tree_usage(root)
        with mock.patch.object(remote, 'snapshot', return_value=(self.root, {'createdAt': ops.utc_now()})), \
             mock.patch.object(remote, 'ledger_entries', return_value=[]), \
             mock.patch.object(remote, 'EVIDENCE', root), mock.patch.object(remote, 'BACKUPS', self.root), \
             mock.patch.object(remote.subprocess, 'run', return_value=mock.Mock(returncode=0, stdout='healthy')):
            inspected = remote.inspect()
        self.assertFalse(inspected['capacity']['available'])
        self.assertTrue(inspected['safetyQueue']['available'], 'A disk-inventory issue must not hide known report backlog')

    def healthy_remote(self):
        return {'containerHealthy': True, 'disk': {'total': 1000, 'used': 100, 'free': 900},
                'snapshot': {'available': True, 'createdAt': ops.utc_now()}, 'erasureLedger': {'available': True},
                'capacity': {'available': True, 'databaseBytes': 100, 'walBytes': 0, 'evidence': {'bytes': 0}, 'backups': {'bytes': 100},
                             'maxWorkspaceFiles': 1, 'maxWorkspaceMembers': 2, 'pendingEvidenceDeletions': 0, 'pendingErasureFiles': 0},
                'safetyQueue': {'available': True, 'openReports': 0, 'oldestOpenAgeSeconds': 0}}

    def test_health_thresholds_detect_backlog_age_capacity_and_recovery_failures(self):
        remote_state = self.healthy_remote()
        self.assertEqual(ops.remote_problem_codes(remote_state, {}), [])
        remote_state['capacity'].update({'databaseBytes': 1_000_000_000, 'maxWorkspaceFiles': 180, 'pendingEvidenceDeletions': 1})
        remote_state['safetyQueue'].update({'openReports': 50, 'oldestOpenAgeSeconds': 86400})
        self.assertEqual(ops.remote_problem_codes(remote_state, {}), ['DATABASE_HIGH', 'FILE_CLEANUP_PENDING', 'SAFETY_QUEUE_HIGH', 'SAFETY_REPORT_OVERDUE', 'WORKSPACE_FILES_HIGH'])
        self.assertNotIn('DATABASE_HIGH', ops.remote_problem_codes(remote_state, {'thresholds': {'databaseBytes': 2_000_000_000}}))
        remote_state['snapshot'] = {'available': False}
        self.assertIn('BACKUP_MISSING', ops.remote_problem_codes(remote_state, {}))
        with self.assertRaises(ValueError):
            ops.remote_problem_codes(remote_state, {'thresholds': {'diskUsedFraction': float('nan')}})

    def test_check_only_never_reads_key_transfers_archives_or_overwrites_recovery_status(self):
        config = {'stateDirectory': str(self.root)}
        prior = self.root / 'status.json'
        prior.write_text('{"status":"prior recovery"}')
        with mock.patch.object(ops.urllib.request, 'urlopen', return_value=io.BytesIO(b'{"status":"ok","service":"vergecommon"}')), \
             mock.patch.object(ops, 'remote_inspect', return_value=self.healthy_remote()), \
             mock.patch.object(ops, 'pull_archive') as transfer, mock.patch.object(ops, 'gpg_command') as key, \
             mock.patch.object(ops, 'rehearse') as rehearse:
            result = ops.run(config, check_only=True)
        self.assertEqual(result['status'], 'healthy')
        self.assertFalse(result['archiveTransferPerformed'])
        self.assertEqual(result['notificationDelivery']['status'], 'disabled')
        transfer.assert_not_called()
        key.assert_not_called()
        rehearse.assert_not_called()
        self.assertEqual(prior.read_text(), '{"status":"prior recovery"}')
        self.assertTrue((self.root / 'inspection-status.json').is_file())

    def test_retention_is_plan_only_and_preserves_minimum_recent_ledgers_and_unknown_files(self):
        destination = self.root / 'encrypted'
        destination.mkdir()
        for day in range(1, 6):
            (destination / f'snapshot-2026-09-{day:02d}T12-00-00-000Z-abc.tar.gz.gpg').write_bytes(b'synthetic ciphertext')
        (destination / 'ledger-synthetic.tar.gz.gpg').write_bytes(b'ledger')
        (destination / 'unknown.txt').write_bytes(b'unknown')
        (destination / 'snapshot-2026-09-01T12-00-00-000Z-link.tar.gz.gpg').symlink_to(remote.DATABASE)
        before = {path.name: path.lstat().st_size for path in destination.iterdir()}
        plan = ops.retention_plan(destination, 7, 2, now=datetime(2026, 9, 19, tzinfo=timezone.utc).timestamp())
        self.assertEqual(plan['mode'], 'plan_only')
        self.assertEqual(plan['filesDeleted'], 0)
        self.assertEqual(len(plan['candidates']), 3)
        self.assertEqual(len(plan['held']), 5)
        self.assertEqual(before, {path.name: path.lstat().st_size for path in destination.iterdir()})
        with self.assertRaises(ValueError):
            ops.retention_plan(destination, 7, 1)


if __name__ == '__main__':
    unittest.main()
