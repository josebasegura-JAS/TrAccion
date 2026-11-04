# PR B — Health-check SQLite sin acumulación tras cortes Wi-Fi

## Problema
El renderer deja de esperar el health-check a los seis segundos, pero
el IPC principal continúa en cola y la E/S sobre SMB puede seguir bloqueada.
Los reintentos anteriores creaban otras entradas en la cola SQLite, sin
cancelar la operación inicial. Esto retrasaba el diagnóstico y podía aumentar
la espera por recursos del sistema operativo.

## Solución
- `database:health-check` utiliza la opción `singleFlight` de la cola IPC:
  mientras exista un health-check pendiente, todas las peticiones nuevas
  reciben la misma promesa, sin añadir trabajo en cola.
- **La reserva se libera cuando termina la operación real en la cola**,
  no cuando vence su timeout de respuesta. Es imprescindible porque el
  timeout no cancela la escritura/lectura del sistema operativo.
- Se registra un diagnóstico de unión de solicitudes (número pendiente,
  operación actualmente ejecutada, duración de esa operación y estado
  de timeout), sin rutas ni datos personales.
- El timeout observado del health-check pasa de 12 a 25 segundos, al igual
  que otras operaciones de recuperación. Las escrituras ordinarias conservan
  el límite de 12 segundos.
- Se conserva el orden y la serialización. No se ejecutan health-checks por
  delante de escrituras aún pendientes de resultado.

## Qué no hace esta PR
- No cancela operaciones `fs` ni reabre SQLite por fuera de la cola.
- No reduce el tiempo que Windows/SMB tarda realmente en informar de una
  llamada colgada. Durante ese tiempo el monitor puede mostrar reconexión
  pendiente.
- No implementa todavía cancelación/generación de recuperación del renderer
  ni cambia `completeRecovery()`: eso pertenece a la fase C.
- No cambia datos, backups, bloqueos por registro, formatos ni módulos.

## Pruebas
- Solicitudes simultáneas: un único health-check y una entrada en cola.
- Timeout: solicitudes posteriores comparten el mismo resultado y no
  encolan una comprobación nueva mientras la operación real continúa.
- Una escritura retrasada mantiene su posición anterior al health-check.
- Tras finalizar realmente la operación, se permite un nuevo diagnóstico.
- El timeout de otras operaciones sigue siendo 12 segundos.

## Validación operativa
1. En copia de la base, iniciar una escritura que tarde más de seis segundos
   y comprobar los intentos de reconexión sin aumento sostenido de la cola.
2. Verificar que ningún nuevo health-check adelanta la escritura anterior.
3. Restaurar Wi-Fi y confirmar que se permiten nuevas comprobaciones una
   vez terminada la operación real.
4. Si permanece una operación SMB colgada, **no** forzar salida o escritura
   mientras su resultado sea indeterminado.
