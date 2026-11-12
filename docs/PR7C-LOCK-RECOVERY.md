# PR7C · Recuperación de locks corruptos y liberación ordinaria

## Cambios

- Los metadatos corruptos o incompletos dejan de borrarse automáticamente solo por el mtime del directorio. El mecanismo falla cerrado y conserva los archivos si no puede demostrar su identidad. **Limitación deliberada**: un bloqueo corrupto persistente puede requerir intervención técnica; la liberación administrativa PR7B también exige metadatos válidos.
- La última liberación ordinaria aparta owner.json mediante rename dentro de .lockdir, vuelve a inspeccionar los metadatos y solo elimina lo capturado si la identidad y el heartbeat coinciden.
- Si un heartbeat o propietario nuevo aparece durante la operación, se conserva el directorio; writeFile con flag wx evita sobrescribir la nueva identidad.
- Una barrera compartida en el proceso impide que una nueva adquisición se solape con el release físico de la última adquisición anterior.
- No se modifican el TTL de 30 s, el heartbeat, el esquema SQLite, las escrituras ni las copias de seguridad.

## Pruebas

Cuatro escenarios añadidos a databaseLockManager.protocolCharacterization.test.ts: metadatos corruptos envejecidos, nuevo propietario entre lectura y rename, reentrada durante release final y heartbeat que reaparece tras rename.

## Riesgo residual

El protocolo de archivos de SMB y la sincronización de relojes pueden fallar de maneras que no reproduce un filesystem local simulado. No equivale a ensayos reales con dos equipos. No liberar manualmente carpetas de bloqueo con datos corruptos sin verificar previamente la titularidad y la inactividad del proceso remoto.
