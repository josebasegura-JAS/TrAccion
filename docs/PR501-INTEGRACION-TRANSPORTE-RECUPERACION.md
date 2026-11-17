# PR501 — Integración experimental del transporte, journal y recuperación de escritor SQLite

## Objetivo y alcance

Agrupa en **una sola PR** tres bloques que antes estaban aislados: (1) admisión estricta de escrituras con recibo transaccional, (2) recuperación asistida de operaciones del journal bajo una barrera SMB real, (3) cierre persistente y no destructivo del marcador de proceso del supervisor PR500.

La implementación **no se conecta al IPC de producción**, no modifica SQLite productiva y no habilita el escritor. Se exige CI verde y pruebas reales Windows/SMB antes de tomar una decisión de despliegue.

## 1. Transporte de recibos

`receiptBackedWriterTransport.ts` solo admite solicitudes con variante `*-receipted` declarada en el protocolo y con UUID/generación/operationId válidos. Comprueba el protocolo antes de registrar, realiza **registro durable** mediante el coordinador ANTES de enviar al child, espera respuesta correlacionada por kind e ID y registra ACK sin considerarlo commit. Si el envío, timeout, ACK o journal falla, **no reintenta**. Una petición enviada con resultado incierto llama a `workerUncertain`; el journal persiste el estado pendiente para conciliación por SQLite.

Las operaciones sin recibo y las respuestas de otro ID se rechazan, incluyendo cuando el mensaje de transporte llegó correctamente.

## 2. Barrera de recuperación SMB

`exclusiveWriterRecoveryBarrier.ts` reutiliza `DatabaseLockManager` en lugar de inventar un lock nuevo. Verifica inactividad local externa, toma el lock distribuido, inicia heartbeat, **lee de nuevo el owner real SMB**, ejecuta la conciliación y vuelve a verificar propiedad e inactividad ANTES de devolver éxito. Espera la suspensión completa del heartbeat y libera el lock. Pérdida de red, error de exclusión o conflicto de owner envenenan la instancia; no hay reintento automático.

La prueba de terminación del proceso huérfano es **independiente** del lock SMB: el TTL del lock no se usa para deducir EXIT.

## 3. Recuperación integral

`detachedWriterRecoveryWorkflow.ts` asocia `detachedWriterProcessStore` de PR500 y `DurableWriterJournal` al recuperador de PR489. Requiere marcador `exit-confirmed` válido para el UUID y generación activa, verifica terminación del proceso **antes y dentro** de la barrera, valida integridad + identidad + esquema de SQLite mediante `verifySqliteIntegrityReadOnly` incluso si no hay operaciones pendientes, impide conciliar generaciones ajenas y verifica recibos transaccionales para cada operación desconocida.

`orphanedWriterJournalRecovery.ts` admite ejecutar una operación finalizadora **dentro de la misma exclusión real**, sin abrir una ventana entre los recibos y la persistencia del resultado.

`detachedWriterProcessStore.ts` añade el estado duradero `reconciled`, persistido con archivo temporal, fsync y rename atómico. **No borra el marcador**: `claim()` sigue rechazando un nuevo proceso incluso después de una recuperación correcta. No puede hacerse una reapertura automática ni declarar recuperación completa con un ACK.

## Tests

- SQLite real de prueba con datos escritos atómicamente junto al recibo, operación con ACK sin recibo y operación sin commit.
- Journal de origen legacy sin recibos: bloqueado. Receipt table ausente: resultado incierto, no se interpreta ausencia como «no guardado».
- Ruta de recuperación sin operaciones pendientes: exige igualmente identidad SQLite, barrera y terminación.
- Marcador `launching` de posible huérfano: no recupera. Marcador ya conciliado: no autoriza un segundo escritor.
- UUID distinto, esquema/identidad inválidos y generación ajena: cuarentena.
- SMB inaccesible y comprobación posterior del owner fallida: no se declara éxito ni se libera el bloqueo persistente.
- Escritura journal-before-wire, respuesta de otro ID, timeout y fallo de journal: sin reenvío.
- Admisión concurrente a la barrera: rechazada.

## NO-GO antes de producción

1. **No hay comprobador de terminación huérfana implementado para Windows** que demuestre de manera independiente la muerte del proceso previo tras caída de main. El callback `assertPreviousWriterTerminated` requiere implementación y pruebas reales, no una suposición por PID/TTL.
2. **No hay reactivación de main ni autorización para retirar tombstone**. Se requiere una decisión explícita de despliegue con exclusividad verificada.
3. El transporte sigue siendo experimental: faltan sus rutas IPC productivas y garantizar cobertura de **todos** los módulos, también las exportaciones/importaciones que abran conexiones o escriban.
4. La seguridad real del bloqueo, heartbeat y recuperación tras caída de red debe ensayarse en dos Windows con base ficticia en SMB.
5. Durabilidad del archivo de marcador y journal en Windows requiere pruebas de apagado brusco y fichero parcialmente escrito.

**Conclusión técnica: implementación agrupada de mecanismos de integración/recuperación experimental, no autorización de activación.**
