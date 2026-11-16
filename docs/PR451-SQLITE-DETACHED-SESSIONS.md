# PR451 · Guardados especializados de Comité, Paritaria y Actas en utilityProcess (preparación)

## Alcance real
- Se reutiliza `createSesionesRepository`, que implementa los guardados OCC de `comite_session_records`, `paritaria_session_records` y `acta_records`, incluyendo migración legacy desde `persisted_records` y token de actualización.
- Protocolo tipado `detached:save-session` y respuesta `detached:session-saved` con lista cerrada de módulos, propietario, revisión esperada y valor.
- Runner de un solo guardado, con flujo `ready → open → save-session → close → exit(0)`. Un cierre incierto no se convierte en éxito ni provoca repetición automática.
- Pruebas SQLite reales para alta, OCC, token y migración legacy de los tres módulos; pruebas de error de protocolo y supervisión del proceso.

## Restricciones
**NO conectado a los IPC de producción.** El main sigue siendo propietario y escritor. Se requiere un coordinador que congele nuevas operaciones, drene todas las E/S, cierre el handle del main, retenga el lock SMB, verifique identidad/esquema y confirme exit(0) antes de restaurar propiedad y programar backup.

**Las operaciones atómicas de cierre de sesión, importación de histórico, expedientes, tareas vinculadas y procesos adicionales NO quedan migradas** por este adaptador. En particular no debe utilizarse este guardado simple para sustituir un workflow de cierre de Comité o Paritaria que requiera transacciones en varias tablas.

El adaptador no abre el handle por sí mismo; lo recibe ya verificado y adquirido por el proceso aislado. Los callbacks de backup y guardas de propiedad están deshabilitados **únicamente porque** el coordinador externo deberá ejecutarlos antes y después de esta operación. La creación de una nueva factoría por guardado no sustituye una futura política de estado de migración para workers persistentes.

## Validación
Requiere TypeScript, ESLint, Vitest y Electron en verde. Se necesitan pruebas Windows reales con dos clientes y fallos SMB antes de activar el escritor auxiliar en producción.
