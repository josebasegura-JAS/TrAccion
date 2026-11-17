# PR487 — Recibos de commit para Sorteos, Lotería y Teletrabajo batch

## Implementado — experimental
- `detached:save-lottery-receipted`: campaña, solicitudes, arqueos y token bajo la transacción del core productivo; recibo del mismo commit.
- `detached:save-sorteos-receipted`: sorteos y exclusiones, migración legacy, token y recibo en una misma transacción.
- `detached:save-teletrabajo-batch-receipted`: lote de solicitudes, migración legacy, token y recibo en una misma transacción.
- Identificador de operación único, generación y UUID cotejados contra el worker abierto realmente; mensajes legacy siguen sin recibo, únicamente para compatibilidad de ensayos.
- Una excepción SQL o `ok:false` no confirma el recibo; una operación repetida es rechazada antes de ejecutar los cambios.

## Pruebas
SQLite real: confirmación y relectura de recibo; conflicto OCC para campaña y sorteos; conflicto en segunda solicitud con rollback del lote; protección de duplicados entre familias y validación de tipos de mensaje.

## Limitaciones / NO-GO
- No se habilita el worker en producción.
- Cierres atómicos de sesiones, importaciones de histórico y coordinación tienen transacciones especializadas aún sin recibo. Deben cubrirse en PR488.
- Falta reconciliación de journal tras reinicio con identidad de base, evidencia durable y barrera SMB real (PR489).
- Faltan pruebas de dos equipos Windows, pérdida/reconexión SMB, actividades independientes, backups y recuperación (PR490).
- Falta auditoría final y una activación controlada solamente después de superar esos ensayos (PR491 o posteriores).
- El worker antiguo y las rutas IPC productivas no se modifican. Las garantías sobre commit aplican **solo a las variantes con recibo**.
