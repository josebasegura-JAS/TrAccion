# Motor aislado: exclusividad y validación

La apertura ordinaria (sqliteConnection), la validación de backups y la verificación de integridad rechazan acceso nativo desde main en modo experimental. El probe y los workers siguen siendo procesos auxiliares. No es un inventario certificado de todas las futuras rutas.

Lecturas explícitas: getPersistedRecordSnapshot, getPersistedRecordsTokenSnapshot y loadPersistedRecordsHydrationSnapshot. Todo lo demás mantiene contexto exclusivo, especialmente loadTaskRecordsSnapshot (migración dentro de transacción), mantenimiento, backups y restauraciones.

El smoke Electron amplía la prueba local a escrituras concurrentes en registros distintos y backup real abierto en otra carpeta temporal y rechazo de restauración en PRUEBAS. No prueba SMB físico. La restauración sigue deshabilitada en PRUEBAS; una restauración real queda pendiente de una auditoría específica y requiere cerrar los demás clientes. El reinicio supervisado permanece bloqueado mientras no exista un protocolo de drenaje de backups y reconciliación de escrituras inciertas.
