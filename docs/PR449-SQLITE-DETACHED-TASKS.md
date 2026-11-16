# PR449 · Primer repositorio especializado en el escritor SQLite auxiliar

## Objetivo
El escritor JSON genérico preparado en #444 no cubre los requisitos de Tareas: bloqueo de edición por otro propietario (incluido lock de módulo), migración de tareas legacy desde `persisted_records`, conflictos de revisión y actualización del token compartido. Usarlo directamente para `task_records` sería una regresión multiusuario.

## Código implementado
- `detachedTaskWriterCore.ts` ejecuta **el mismo** `createTaskRepository` que utiliza producción, con una conexión SQLite inyectada y un `ownerId` explícito. No copia ni simplifica su SQL: conserva controles de bloqueo de `editing_locks`, migración legacy y OCC.
- El protocolo `detached:save-task` valida carga y propietario; el worker ejecuta el repositorio especializado y responde con el mismo tipo de resultado que usa la interfaz actual.
- `detachedTaskWriterRunner.ts` gestiona `ready → open → save-task → close → exit(0)`. Un timeout, mensaje incorrecto o salida anómala deja resultado incierto y no repite la operación.
- Bridge tipado `saveTaskInDetachedUtilityProcess` disponible para el futuro controlador exclusivo.
- Tests de SQLite real: altas, OCC, bloqueos ajenos, bloqueo de módulo, locks caducados, migración legacy, token de sincronización y validación de protocolo. Tests de runner: cierre confirmado y fallo cerrado.

## Restricciones de seguridad
**No se activa aún en producción**. El main continúa como propietario de la conexión y todos los guardados. El controlador externo debe garantizar: cierre del handle del main, reserva única del motor, exclusión SMB, heartbeat, verificación de identidad, backup en el main tras `exit(0)`, y reconciliación de respuestas inciertas. El adaptador **no adquiere locks SMB por sí mismo** y el callback de backup permanece deshabilitado dentro del hijo para no introducir E/S fuera del propietario.

La implementación actual crea una instancia de repositorio por guardado: una futura sesión de worker persistente necesitará mantener el estado de migración o comprobarlo al abrir. Los otros repositorios especializados siguen en main.

## Pendiente antes de migración integral
1. Inventario y portado de repositorios adicionales (sesiones Comité/Paritaria, tickets, lotería, sorteos, importaciones, presupuestos y configuración).
2. Coordinación de propietario único en runtime, locks/heartbeat/backups y ciclo de vida.
3. Pruebas Windows SMB de dos clientes, cortes y reconexión, operación en curso y cierre.
