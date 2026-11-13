# Migración SQLite · Sesión real supervisada en utilityProcess

## Código entregado
- `detachedCriteriaWriterRunner.ts`: controlador de una sesión completa **ready → open → save → close → exit(0)**. Acepta una sola escritura de Criterios RRLL, sin SQL procedente del renderer.
- `detachedCriteriaWriterBridge.ts`: función `saveCriteriaInDetachedUtilityProcess` que conecta directamente el controlador a `utilityProcess.fork`, permitiendo el camino de ejecución del proceso auxiliar.
- `detachedCriteriaWriterRunner.test.ts`: pruebas del protocolo con un proceso simulado: éxito confirmado únicamente tras `exit(0)`, conflicto OCC, salida anormal, identificador de operación incorrecto, timeout, ausencia de reintento y parámetros inválidos.
- Conserva las pruebas de escritura transaccional en fichero SQLite real incorporadas en PR #440.

## Seguridad
Un evento `detached:saved` no se toma como éxito hasta confirmar salida normal del proceso. Ante timeout se solicita su terminación, **pero la promesa queda pendiente hasta recibir exit**. No se libera un supuesto derecho de escritura ni se arranca automáticamente otro proceso. Si el mensaje llega tarde, se ignora; la operación no se retransmite. El llamador debe contrastar con SQLite los resultados inciertos antes de cualquier repetición.

El código sigue **desconectado de los IPC de producción**: la base compartida aún tiene su conexión escritora principal y sus repositorios, backups y locks viven en `sqlitePersistence.ts`. Invocar en paralelo el nuevo proceso sobre esa misma base no daría exclusividad por instancia ni coordinación suficiente por SMB. Ningún flag activa esta ruta contra la base del usuario.

## Validación pendiente y condición de activación
1. Confirmar CI de TypeScript, lint y Vitest.
2. Añadir ensayo Electron **end-to-end del fork real** (la prueba unitaria inyecta un proceso simulado), incluyendo proceso caído tras COMMIT y salida confirmada.
3. Centralizar en el nuevo propietario los **todos** los repositorios escritores y transferir el handle y ciclo de vida de backups/locks. La migración no puede efectuarse con dos escritores locales simultáneos.
4. Pruebas Windows con dos clientes, cortes de cable/Wi-Fi y recuperación de la red.

**Esta PR conecta el código real de utilityProcess con un controlador de transacciones, pero no constituye la migración funcional completa de la aplicación.** Evitar ampliar la hoja de ruta: estos requisitos forman parte de la misma entrega de migración y su validación.
