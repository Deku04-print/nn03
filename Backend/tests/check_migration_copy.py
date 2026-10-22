"""Run from Backend: python tests/check_migration_copy.py.

Verify additive migration and demo seed/reverse on a temporary SQLite backup,
without writing the configured development database. This is not a Django test case.
"""
import hashlib
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile


def fingerprint(connection):
    tables = [row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'wl_%'")]
    result = {}
    for table in tables:
        # Values are hashed, never printed; user password hashes remain private.
        rows = sorted(repr(row) for row in connection.execute(f'SELECT * FROM "{table}"'))
        result[table] = hashlib.sha256('\n'.join(rows).encode()).hexdigest()
    return result


def main():
    backend = Path(__file__).resolve().parents[1]
    source_path = backend / 'worklens_dev.db'
    if not source_path.exists():
        raise SystemExit('A development SQLite database is required for this copy-only verification.')
    verify_root = backend / '.verification'
    verify_root.mkdir(exist_ok=True)
    assert verify_root.resolve().is_relative_to(backend)
    with tempfile.TemporaryDirectory(prefix='migration-', dir=verify_root) as folder:
        target = Path(folder) / 'copy.db'
        with closing(sqlite3.connect(source_path.as_uri() + '?mode=ro', uri=True)) as source, closing(sqlite3.connect(target)) as destination:
            before = fingerprint(source)
            source.backup(destination)
        env = {**os.environ, 'DATABASE_URL': 'sqlite:///' + target.as_posix(), 'PYTHONDONTWRITEBYTECODE': '1'}
        def manage(*args):
            subprocess.run([sys.executable, 'manage.py', *args], cwd=backend, env=env, check=True)
        manage('migrate', '--noinput')
        with closing(sqlite3.connect(target)) as connection:
            assert fingerprint(connection) == before, 'Existing records changed during additive migration'
            original_demo_count = connection.execute('SELECT COUNT(*) FROM assistance_expertprofile WHERE is_demo=1').fetchone()[0]
        manage('seed_demo_experts')
        manage('seed_demo_experts')
        with closing(sqlite3.connect(target)) as connection:
            assert connection.execute('SELECT COUNT(*) FROM assistance_expertprofile WHERE is_demo=1').fetchone()[0] == 5
        if original_demo_count == 0:
            manage('seed_demo_experts', '--remove')
        manage('migrate', 'assistance', 'zero', '--noinput')
        with closing(sqlite3.connect(target)) as connection:
            assert fingerprint(connection) == before, 'Existing records changed during seed/cleanup/reverse'
    print('PASS: migration, idempotent demo seed, cleanup and reverse preserve every existing wl_* record; original database untouched.')


if __name__ == '__main__':
    main()
