# PR8A · Caducidad de bloqueos SMB independiente del reloj remoto

## Problema

PR7D documentó E2: `isLockStale` comparaba el heartbeat del equipo remoto con `Date.now()` local. Un PC adelantado 20–25 segundos podía considerar caducado un heartbeat remoto reciente. El fichero `owner.json` no es una fuente fiable de hora común entre los clientes.

## Cambio

- La primera observación de cada combinación (ownerId, hostname, PID, createdAt, updatedAt) **nunca** permite recuperar el lock.
- Solo se considera recuperable un `owner.json` válido si su heartbeat exacto permanece sin cambiar durante **más de 30 segundos monotónicos locales**.
- Un heartbeat nuevo, una identidad distinta o un retroceso del reloj monotónico reinicia el periodo.
- Un timestamp inválido no autoriza recuperación automática. Se conserva el modo *fail-closed* de PR7C.
- Los límites de espera de adquisición y arranque también usan un reloj monotónico; mover la hora del sistema no alarga artificialmente el bucle.
- Se conserva el TTL de 30 s, el intervalo de heartbeat, la semántica de las operaciones normales, las verificaciones de identidad y el mecanismo de cuarentena mediante rename.
- Máximo de 256 observaciones por gestor; la expulsión de una observación obliga a comenzar otra espera completa, nunca acelera la recuperación.

## Coste operativo deliberado

Cuando un cliente encuentra un lock verdaderamente abandonado, **no se permite liberarlo de inmediato aunque su timestamp parezca antiguo**. Debe observar su inmovilidad durante 30 s. Con las esperas de operación existentes (15 s por intento), pueden ser necesarios varios intentos; esta demora es preferible a un falso permiso de escritura simultánea.

La observación es local al proceso y se pierde al reiniciar la aplicación. No crea servidores, procesos en segundo plano ni escrituras SMB adicionales. Si Windows se suspende y el reloj monotónico no avanza, la recuperación se retrasa, pero no se anticipa por cambiar la hora del sistema.

## Límites del cambio

Esta modificación elimina la **caducidad prematura causada exclusivamente por desfases del reloj de pared**, pero no demuestra seguridad absoluta de los leases distribuidos. Si un titular sigue dentro de una escritura más de 30 s sin renovar su heartbeat (por ejemplo, una pausa de E/S), otro cliente podría considerar abandonado su lock. El heartbeat y la validación de propietarios siguen siendo necesarios; esta PR no los sustituye.

La liberación administrativa conserva restricciones propias adicionales para timestamps futuros o inválidos. La aceptación real de dos Windows SMB R1–R10 sigue pendiente.

## Validación

- Simular un reloj local adelantado 25 s frente a un heartbeat real de 10 s: no se reclama inmediatamente.
- Verificar el límite estricto de 30 s de observación monotónica inalterada.
- Renovar el heartbeat y confirmar que reinicia la observación.
- Comprobar retroceso del reloj de observación y timestamps inválidos.
- Repetir pruebas de propietario nuevo durante rename, locks corruptos y liberación ordinaria PR7C.
- Ejecutar validación TypeScript, ESLint y tests de Vitest.
- Antes de despliegue multiusuario, ejecutar R1–R10 en dos equipos Windows, con base de datos de prueba, incluyendo relojes desfasados **solo en laboratorio controlado**.

## Decisión

Cambio de seguridad con degradación deliberada de disponibilidad para locks huérfanos; no persigue mejorar rendimiento. No fusionar si las pruebas automatizadas fallan. No equivale a certificación de SQLite/SMB en hardware real.
