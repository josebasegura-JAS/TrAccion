TrAcción - Incremental backup SQLite nativo
Base: TrAccion-main(20261008-104149).zip / v1.2.186

CAMBIOS INCLUIDOS (SOLO BACKUP)
- electron/persistence/localBackups.ts
  - Nueva función backupSqliteDatabase().
  - Usa Database.backup() (SQLite Online Backup API) para crear una instantánea consistente.
  - Si el backup nativo falla o no está disponible, hace fallback automático a copyFile(), manteniendo el comportamiento anterior.
  - Los backups compartido y diario pueden copiarse desde una instantánea ya consistente.

- electron/persistence/localBackupService.ts
  - Backup vivo: crea una única instantánea SQLite nativa y deriva de ella backup rotado, compartido, diario y secundario.
  - Backup de cierre: crea una única instantánea SQLite nativa y deriva de ella el resto de copias.
  - Se evita ejecutar varios database.backup() simultáneos sobre la misma conexión.
  - No cambia restauración, retención, esquema, configuración ni lógica funcional.

- electron/persistence/localBackups.test.ts
  - Prueba de uso de Online Backup API.
  - Prueba de fallback a copyFile() si el backup nativo falla.

VALIDACIÓN
- Diferencial revisado: solo 3 ficheros modificados.
- Sintaxis TypeScript verificada en los 3 ficheros: OK.
- Typecheck completo no ejecutable en este entorno: instalación de dependencias incompleta (falta @types/node).

APLICACIÓN
Copiar estos ficheros respetando sus rutas sobre la versión base indicada.
