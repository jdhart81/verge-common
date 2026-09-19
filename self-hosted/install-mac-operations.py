"""Install/uninstall a user-owned, hourly VergeCommon backup LaunchAgent."""
import argparse
import json
import os
from pathlib import Path
import plistlib
import secrets
import shutil
import subprocess
import sys

LABEL = 'com.vergecommon.operations'


def install(repository, node, python, gpg, destination, home=None, load=True):
    home = Path(home or Path.home()).resolve()
    repository = Path(repository).resolve()
    destination = Path(destination).resolve()
    if destination != home / 'Desktop/Cowork /Vergecommon/private-backups/encrypted':
        raise ValueError('Destination must be the existing approved VergeCommon Mac backup directory')
    state = home / 'Library/Application Support/VergeCommon/Operations'
    keys = home / '.config/vergecommon/recovery'
    agent = home / 'Library/LaunchAgents' / (LABEL + '.plist')
    os.umask(0o077)
    for directory in (state, keys, destination):
        if directory.exists() and (directory.is_symlink() or directory.stat().st_uid != os.getuid()):
            raise ValueError('Refusing unexpected ownership or symbolic-link destination')
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        directory.chmod(0o700)
    key = keys / 'backup.key'
    if not key.exists():
        with open(key, 'x') as output:
            output.write(secrets.token_urlsafe(48) + '\n')
            output.flush()
            os.fsync(output.fileno())
        key.chmod(0o600)
    if key.is_symlink() or key.stat().st_mode & 0o077:
        raise ValueError('Recovery key must be a private regular file')
    gpg_home = state / 'gnupg'
    gpg_home.mkdir(mode=0o700, exist_ok=True)
    for name in ('operations.py', 'operations_remote.py'):
        shutil.copyfile(repository / 'self-hosted' / name, state / name)
        (state / name).chmod(0o600)
    config = {
        'sshHost': 'codex-keen-forge-bf65',
        'repository': str(repository),
        'node': str(Path(node).resolve()),
        'gpg': str(Path(gpg).resolve()),
        'gpgHome': str(gpg_home),
        'keyFile': str(key),
        'destination': str(destination),
        'stateDirectory': str(state),
        'restoreChecker': str(repository / 'self-hosted/restore-check.mjs'),
        'erasureReplay': str(repository / 'self-hosted/erasure.mjs'),
        'maximumBackupAgeHours': 30,
        'minimumLocalFreeBytes': 5_000_000_000,
        'maximumExtractedBytes': 2_000_000_000,
    }
    config_path = state / 'config.json'
    config_path.write_text(json.dumps(config, indent=2) + '\n')
    config_path.chmod(0o600)
    definition = {
        'Label': LABEL,
        'ProgramArguments': [str(Path(python).resolve()), str(state / 'operations.py'), '--config', str(config_path)],
        'StartInterval': 3600,
        'RunAtLoad': True,
        'ProcessType': 'Background',
        'WorkingDirectory': str(state),
        'StandardOutPath': str(state / 'run.log'),
        'StandardErrorPath': str(state / 'error.log'),
        'Umask': 0o077,
        'ThrottleInterval': 300,
    }
    agent.parent.mkdir(exist_ok=True, parents=True)
    with open(agent, 'wb') as output:
        plistlib.dump(definition, output)
    agent.chmod(0o600)
    if load:
        domain = 'gui/' + str(os.getuid())
        subprocess.run(['/bin/launchctl', 'bootout', domain + '/' + LABEL], capture_output=True)
        subprocess.run(['/bin/launchctl', 'bootstrap', domain, str(agent)], check=True, capture_output=True)
    return {'label': LABEL, 'agent': str(agent), 'config': str(config_path), 'destination': str(destination), 'keyFile': str(key), 'loaded': load}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', default=str(Path(__file__).resolve().parent.parent))
    parser.add_argument('--node', required=True)
    parser.add_argument('--gpg', required=True)
    parser.add_argument('--python', default=sys.executable)
    parser.add_argument('--destination', required=True)
    parser.add_argument('--prepare-only', action='store_true')
    args = parser.parse_args()
    print(json.dumps(install(args.repository, args.node, args.python, args.gpg, args.destination, load=not args.prepare_only), indent=2))


if __name__ == '__main__':
    main()
