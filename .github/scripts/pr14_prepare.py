from pathlib import Path

path = Path('.github/scripts/pr14_apply.py')
text = path.read_text(encoding='utf-8')
old = '''replace_once(\n    'electron/sqlitePersistence.ts',\n    '  savePersistedRecordIfUnchanged,\\n  migrateLocalStorageSnapshot,',\n    '  savePersistedRecordIfUnchanged,\\n  savePersistedRecordsIfUnchanged,\\n  migrateLocalStorageSnapshot,',\n)\nreplace_once(\n    'electron/sqlitePersistence.ts',\n    '  savePersistedRecordIfUnchanged,\\n  migrateLocalStorageSnapshot,\\n  getPersistedRecordSnapshot,',\n    '  savePersistedRecordIfUnchanged,\\n  savePersistedRecordsIfUnchanged,\\n  migrateLocalStorageSnapshot,\\n  getPersistedRecordSnapshot,',\n)'''
new = '''replace_once(\n    'electron/sqlitePersistence.ts',\n    'const {\\n  updateRefreshMetadata,\\n  savePersistedRecord,\\n  savePersistedRecordIfUnchanged,\\n  migrateLocalStorageSnapshot,',\n    'const {\\n  updateRefreshMetadata,\\n  savePersistedRecord,\\n  savePersistedRecordIfUnchanged,\\n  savePersistedRecordsIfUnchanged,\\n  migrateLocalStorageSnapshot,',\n)\nreplace_once(\n    'electron/sqlitePersistence.ts',\n    'export {\\n  savePersistedRecord,\\n  savePersistedRecordIfUnchanged,\\n  migrateLocalStorageSnapshot,',\n    'export {\\n  savePersistedRecord,\\n  savePersistedRecordIfUnchanged,\\n  savePersistedRecordsIfUnchanged,\\n  migrateLocalStorageSnapshot,',\n)'''
if old not in text:
    raise RuntimeError('No se ha encontrado el bloque sqlitePersistence del aplicador')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
