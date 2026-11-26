import hashlib
from pathlib import Path
import sqlite3
import tempfile
import unittest
from contextlib import closing
from uuid import uuid4

from clone_test_db import clone_backup


def fixture(path, environment="production", version=19):
    with closing(sqlite3.connect(path)) as db:
        db.executescript("""
            CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
            CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE persisted_records (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
            CREATE TABLE editing_locks (module TEXT, record_id TEXT);
            CREATE TABLE task_records (id TEXT PRIMARY KEY, value_json TEXT);
            INSERT INTO persisted_records VALUES ('config', '{"x":1}');
            INSERT INTO task_records VALUES ('task-1', '{"title":"ficticio"}');
            INSERT INTO editing_locks VALUES ('tasks', 'task-1');
        """)
        db.execute("INSERT INTO schema_migrations VALUES (?, 'now')", (version,))
        db.executemany("INSERT INTO app_metadata VALUES (?, ?, 'now')", [
            ("application_id", "TrAccion"),
            ("database_uuid", str(uuid4())),
            ("database_created_at", "2026-01-01T00:00:00Z"),
            ("environment", environment),
            ("persisted_records_refresh_token", "token"),
        ])
        db.commit()


class CloneTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "traccion-backup-example.sqlite"
        self.dest = self.root / "test-share"
        self.dest.mkdir()
        fixture(self.source)

    def test_clone_data_identity_and_no_original_changes(self):
        before = hashlib.sha256(self.source.read_bytes()).digest()
        first = clone_backup(self.source, self.dest)
        second = clone_backup(self.source, self.dest)
        self.assertNotEqual(first, second)
        self.assertEqual(first.name, "traccion.sqlite")
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).digest(), before)
        with closing(sqlite3.connect(self.source)) as original, closing(sqlite3.connect(first)) as copy, closing(sqlite3.connect(second)) as copy2:
            get = lambda db: dict(db.execute("SELECT key,value FROM app_metadata"))
            a, b, c = get(original), get(copy), get(copy2)
            self.assertEqual(a["environment"], "production")
            self.assertEqual(b["environment"], "test")
            self.assertEqual(c["environment"], "test")
            self.assertEqual(len({a["database_uuid"], b["database_uuid"], c["database_uuid"]}), 3)
            for table in ("persisted_records", "task_records", "schema_migrations"):
                self.assertEqual(original.execute("SELECT * FROM " + table).fetchall(), copy.execute("SELECT * FROM " + table).fetchall())
            self.assertEqual(b["persisted_records_refresh_token"], "token")
            self.assertEqual(copy.execute("SELECT COUNT(*) FROM editing_locks").fetchone()[0], 0)
            self.assertEqual(original.execute("SELECT COUNT(*) FROM editing_locks").fetchone()[0], 1)
            self.assertEqual(copy.execute("PRAGMA integrity_check").fetchall(), [("ok",)])

    def test_reject_live_and_sidecars(self):
        live = self.root / "traccion.sqlite"
        fixture(live)
        with self.assertRaises(ValueError):
            clone_backup(live, self.dest)
        Path(str(self.source) + "-wal").touch()
        with self.assertRaises(ValueError):
            clone_backup(self.source, self.dest)
        self.assertEqual(list(self.dest.iterdir()), [])

    def test_reject_wrong_environment_schema_identity_and_corruption(self):
        for name, environment, version in (("test", "test", 19), ("future", "production", 20)):
            candidate = self.root / ("traccion-backup-" + name + ".sqlite")
            fixture(candidate, environment, version)
            with self.assertRaises(ValueError):
                clone_backup(candidate, self.dest)
        with closing(sqlite3.connect(self.source)) as db:
            db.execute("DELETE FROM app_metadata WHERE key='database_uuid'")
            db.commit()
        with self.assertRaises(ValueError):
            clone_backup(self.source, self.dest)
        bad = self.root / "traccion-backup-bad.sqlite"
        bad.write_bytes(b"not SQLite")
        with self.assertRaises(sqlite3.DatabaseError):
            clone_backup(bad, self.dest)
        self.assertEqual(list(self.dest.iterdir()), [])

    def test_reject_destination_under_active_database(self):
        fixture(self.dest / "traccion.sqlite")
        child = self.dest / "sub"
        child.mkdir()
        before = (self.dest / "traccion.sqlite").read_bytes()
        with self.assertRaises(ValueError):
            clone_backup(self.source, child)
        self.assertEqual(list(child.iterdir()), [])
        self.assertEqual((self.dest / "traccion.sqlite").read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
