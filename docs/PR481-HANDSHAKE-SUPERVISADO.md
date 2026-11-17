# PR481 — Handshake supervisado y verificable del escritor SQLite

## Cambio implementado (solo ensayo)
- Nueva petición `detached:open-session` con generación de cesión. El proceso auxiliar devuelve `detached:session-opened` con la **generación y el propietario leído de su lease SMB real**.
- Nuevo controlador `createSupervisedDetachedWriterSession` con dos funciones para el coordinador: `startWriter(generation)` y `verifyWorkerSmbOwnership(generation)`. Una confirmación IPC por sí sola no basta: el controlador exige la verificación externa del lock persistente.
- El adaptador `createExperimentalWriterHandoffTransport` de `detachedCriteriaWriterBridge.ts` liga el controlador al `utilityProcess` y usa el verificador de sesión SMB creado en PR480.
- Un mensaje incorrecto, generación distinta, salida prematura o propiedad SMB inválida suspende el inicio; no se reabre el proceso principal ni se reintenta una escritura.
- Compatibilidad: el protocolo anterior `detached:open` y `detached:opened` sigue disponible para los ensayos de operaciones unitarias, sin cambiar los IPC productivos.

## No equivale a integración productiva
- **NO-GO**: este adaptador no está conectado al cierre real de todos los handles SQLite, ni al sistema global de IPC. No activar `getSqliteWriterHandoffReadiness().ready`.
- El coordinador todavía necesita un supervisor de ciclo completo que coordine, incluso durante carreras entre `main-closed` y `worker`, `onExitConfirmed`/cuarentena, cierre ordenado, finalización de las E/S asíncronas y cancelación segura de mensajes.
- El journal PR478 requiere prueba del commit por `operationId` en SQLite; un ACK de sesión o escritura no demuestra commit.
- Falta validar en dos PCs Windows, cortes SMB, reinicios y reconexiones.

## Pruebas
Casos de generación correcta e incorrecta, cierre prematuro y error de prueba SMB, más la cobertura previa de locks y coordinador.

## Siguientes PR
PR482: evidencia transaccional comprobable por operación; PR483: supervisor de recuperación y cuarentena; PR484: integración y compatibilidad global; PR485: pruebas físicas de dos PC; PR486: auditoría y activación controlada. Ajustar si las pruebas descubren problemas.
