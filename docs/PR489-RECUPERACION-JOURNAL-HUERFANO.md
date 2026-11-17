# PR489 — Conciliación asistida del journal tras reiniciar Electron

## Problema y solución

La PR478 dejó un journal durable de operaciones que sobrevive a cierres inesperados. Tras reiniciar Electron ya no existe el ledger en memoria y **no puede suponerse que el utilityProcess anterior haya terminado**. Por eso una operación `submitted` o `acknowledged` se mantiene incierta y nunca se reenvía automáticamente.

Esta fase incorpora `reconcileOrphanedWriterJournal` como mecanismo **experimental de recuperación asistida**, sin ruta IPC productiva ni restauración automática del motor:

1. Abre un journal existente y rechaza cualquier entrada sin `receiptBacked: true`. La procedencia se debe guardar *antes* de enviar el mensaje con el nuevo protocolo transaccional; las entradas antiguas no tienen esa evidencia.
2. Obliga al supervisor a demostrar que el writer **anterior** realmente ha terminado; un PID obsoleto, timeout o expiración TTL no son suficientes.
3. Exige una barrera exclusiva mantenida durante toda la conciliación, con validación independiente del lock SMB, estado de red, identidad y drenaje de actividades/handles.
4. Repite la comprobación de terminación dentro de la barrera.
5. Marca el journal como `unknown` de forma duradera y compara cada `operationId` y generación contra la **base SQLite en lectura exclusiva de recuperación** mediante recibos atómicos, identidad, esquema y `PRAGMA quick_check`.
6. Guarda `committed` o `not-committed` solamente tras esa verificación real. Un fallo detiene el procedimiento y conserva el resto de entradas pendientes.
7. Devuelve un informe de resultados. **No cambia el fence a `main`, no abre ningún handle de escritura, no envía una segunda vez operaciones y no autoriza reintentos por sí mismo**.

## Cambios del contrato de journal

`recordSubmitted(id, generation, receiptBacked = false)` acepta un marcador optativo de procedencia. El valor predeterminado es **false** por compatibilidad, de forma que las rutas anteriores se mantienen NO recuperables automáticamente. La próxima integración del transporte deberá marcar `true` **únicamente** después de seleccionar la variante de mensaje `*-receipted`; no basta una declaración de la UI. El nuevo sistema sigue apagado.

## Pruebas incorporadas

- Recuperación tras reapertura del journal local de una operación realmente confirmada y otra ausente, con recibos SQLite.
- Worker previo aún activo; error si no hay barrera SMB; carrera entre primera comprobación de terminación y adquisición de exclusividad.
- Ausencia de tabla de recibos: se trata como **incierto**, nunca como `not-committed`.
- Identidad SQLite distinta: no se levanta la cuarentena.
- Operaciones legacy sin marcador `receiptBacked`: conciliación bloqueada.
- Segunda ejecución sin pendientes: informe vacío, nunca reapertura automática.

## Condiciones NO-GO aún abiertas

- No hay aún supervisor productivo que implemente y pruebe `assertPreviousWriterTerminated` o `withExclusiveRecoveryBarrier`: no se acepta un simple booleano ni un callback vacío como prueba.
- El journal utiliza un archivo local: debe comprobarse ausencia de escritores concurrentes del mismo journal, `fsync` y comportamiento de reinicios/antivirus en Windows.
- La recuperación no está integrada con el coordinador ni implementa activación/reapertura: requiere una evaluación nueva del estado de todos los handles, backups y la red tras la conciliación.
- Validar experimentalmente **dos instancias** y, para resiliencia SMB real, dos equipos Windows; forzar cortes de red, salida/crash del worker y reinicios durante el guardado y la conciliación.
- Seguir sin activar el writer en producción hasta auditoría final y criterios GO/NO-GO.

## Siguiente orden

PR490: pruebas integradas, preparación de harness reproducible para dos instancias y barreras SMB reales. PR491: auditoría global y decisión de activación; dividir en PR adicionales si faltan garantías.
