# PR483 — Cuarentena y recuperación verificada del worker SQLite (fase experimental)

## Problema detectado
En el intervalo `main-closed` → `worker`, el proceso auxiliar puede terminar durante `startWriter()` o durante el `await` de comprobación de propiedad SMB. Antes de PR483, `markWorkerExited` y `markWorkerUncertain` no aceptaban `main-closed`. Una notificación de salida podía ser rechazada o perderse; ninguna cesión debe publicar propiedad de un proceso muerto.

## Corrección
- El fence acepta la salida o el estado incierto **de la generación correcta** cuando main ya está cerrado; pasa a `quarantine`.
- `confirmWorkerStarted` sigue exigiendo `main-closed`: si hubo salida durante una operación asíncrona, la cesión falla sin volver a abrir main.
- `workerExited` conserva la confirmación de salida real; `workerUncertain` **no** cuenta como confirmación de salida.
- `reconcileReceiptedWriterOperation` en el coordinador exige estado `quarantine`, **EXIT confirmado**, operación registrada en journal **y** ledger de la generación activa, identidad de base coincidente y comprobación del recibo en SQLite por un handle de solo lectura. No acepta un ACK como prueba de commit.
- Si la verificación falla o no hay recibos, la operación continúa sin conciliar y la barrera sigue congelada. No hay reintentos automáticos.

## Pruebas
- Caída durante `startWriter` y durante la comprobación asíncrona de SMB.
- Incertidumbre anterior a `READY` sin salida confirmada.
- Restauración bloqueada sin reconciliación e identidad comprobada.
- Base SQLite real: operación confirmada, operación ausente, ruta inexistente y negativa de conciliación antes de EXIT.

## Límites: NO-GO
- El nuevo sistema **no está conectado al IPC de producción**. No activar el worker todavía.
- La conciliación automática solo es válida para escrituras con recibo: hoy únicamente la ruta experimental de Criterios RRLL de PR482.
- El journal local puede sobrevivir al reinicio del proceso main, pero el ledger en memoria **no**: la recuperación de un journal huérfano sigue bloqueada a propósito y requiere diseño y pruebas adicionales.
- La API anterior `reconcileWriterOperation` aún acepta una evidencia declarada por su caller. No usarla como ruta de recuperación productiva; la futura integración debe restringirla a evidencia verificada.
- Hay que supervisar explícitamente las carreras donde el proceso sale antes de cerrarse main, así como los cierres y callbacks duplicados.
- No se han efectuado pruebas con dos equipos Windows sobre SMB real ni simulación física de cortes de Wi-Fi.

## Próximas fases
- PR484: completar/adaptar rutas escritoras y contratos del journal, con pruebas por módulo.
- PR485: pruebas Windows multiusuario/SMB y recuperación de fallos, dividiendo PR si es necesario.
- PR486: auditoría, decisión de despliegue y activación controlada **solo tras cumplir los criterios de aceptación**.
