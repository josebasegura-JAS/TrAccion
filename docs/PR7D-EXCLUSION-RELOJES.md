# PR7D · Exclusión local y relojes distribuidos

## Diagnóstico de las reentradas

El contador activeLocalLeases impide una liberación prematura, pero no serializa dos callbacks de withDatabaseOperationLock del mismo proceso. acquireLock permite reutilizar su propio ownerId y PID.

PR7D añade una cola compartida por ruta y proceso para callbacks exclusivos de withDatabaseOperationLock. La segunda operación espera a la finalización completa de la primera, incluido el release físico de PR7C. Un error libera su turno sin ignorar el resultado de la primera operación. Las lecturas concurrentes conservan su comportamiento.

Las adquisiciones directas de acquireLock siguen teniendo semántica reentrante, con contador de leases. La nueva cola no reemplaza la cola IPC ni garantiza exclusión de equipos remotos si falla el protocolo SMB.

## Límite operacional de la cola

- No anidar una operación exclusiva con withDatabaseOperationLock sobre la misma base dentro de otra operación exclusiva que espere su resultado: puede formar un ciclo de espera. Los wrappers deben ser independientes. La cola IPC ordinaria ya serializa sus llamadas.
- Si una operación nunca finaliza, la siguiente permanece pendiente; no liberar automáticamente escrituras cuyo resultado sea incierto.
- Rutas distintas pueden operar de forma independiente.

## Riesgo E2 de desfase horario: permanece abierto

isLockStale compara updatedAt remoto con Date.now() local y mantiene el TTL de 30 s. Un equipo adelantado 20 s puede considerar vencido un heartbeat real de 11 s (aparente 31 s). PR7D reproduce el caso mediante una prueba determinista; no declara que se haya corregido.

Controles antes de usar SMB con dos equipos:

1. Verificar origen de sincronización y hora de ambos PC y servidor con los comandos Windows w32tm /query /status y w32tm /query /source.
2. Si se dispone de servidor horario autorizado, contrastar mediante w32tm /stripchart /computer:SERVIDOR /samples:5 /dataonly. Solicitar al área de sistemas corregir los desfases importantes de forma centralizada.
3. No modificar manualmente relojes en producción para forzar errores; utilizar dos equipos de ensayo y SQLite de pruebas.
4. Documentar el desfase en el protocolo PR6C y repetir R1–R10. No asumir sincronización por mostrar una hora visualmente correcta.

## Pruebas incorporadas

- Dos callbacks del mismo gestor sin solapamiento.
- Dos gestores con la misma identidad local mantienen exclusión del wrapper.
- El rechazo de una operación permite ejecutar la siguiente.
- Independencia de operaciones sobre bases distintas.
- Umbral exacto de caducidad: mayor que 30 s.
- Caracterización adicional del desfase local que adelanta la caducidad.

## Resultado

La exclusión de callbacks de operaciones mejora sin alterar el TTL o el formato de lock. Los relojes distribuidos continúan siendo riesgo residual; para validar comportamiento real hacen falta pruebas de PR6C.
