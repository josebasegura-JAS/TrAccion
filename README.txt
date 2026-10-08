Corrección TypeScript del backup SQLite nativo.

Único fichero modificado:
- electron/persistence/localBackups.ts

Cambio:
- Se añade un tipo local DatabaseWithBackup para declarar de forma segura el método opcional backup().
- No cambia la lógica ni el comportamiento del backup.
- Mantiene backup nativo + fallback copyFile.
