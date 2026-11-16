# PR448 · Reentrada de la barrera SQLite y ciclo de vida

## Motivo
Tras #447, backups, VACUUM y restauraciones quedan monitorizados de extremo a extremo, pero ciertas operaciones ya admitidas llaman internamente a otras que vuelven a utilizar `sqliteIndependentActivityTracker.run()`. Si una cesión ejecuta `beginFreeze()` mientras un trabajo admitido espera E/S SMB, la reentrada legítima podría rechazarse con «E/S SQLite/SMB suspendida», interrumpiendo un backup o una restauración a medias.

## Implementación
- `sqliteIndependentActivityTracker` usa `AsyncLocalStorage<number>` para identificar la operación raíz **activa**. Permite suboperaciones de esa raíz durante freeze, pero no permite que entren llamadas nuevas sin raíz viva, aunque una tarea desprendida conserve su contexto asíncrono.
- Cada suboperación continúa contándose en el drenaje. Ningún timeout externo se interpreta como finalización de la E/S.
- `sqlitePersistence.ts` registra como una sola actividad observable el ciclo de vida **completo** de inicialización, recuperación tras error de E/S, cambio de directorio compartido, restablecimiento de directorio y cierre. Sus suboperaciones ya instrumentadas pueden completar dentro de esa admisión.
- Tests: suboperaciones durante freeze, rechazo de trabajo ajeno, contexto asíncrono desprendido después de finalizar raíz, drenaje tras error.

## Seguridad y límites
No se activa el traspaso del propietario real de SQLite a `utilityProcess`. Sigue operando el escritor de producción en main; esta PR elimina una barrera de reentrada incorrecta y amplia el seguimiento del ciclo de vida. Antes de conectar el coordinador al arranque es necesario auditar exhaustivamente todas las operaciones directas de repositorios, locks SMB, migraciones, backup y recuperación.

Las pruebas no equivalen a verificar funcionamiento multiusuario ante caída física de Wi-Fi o desconexión de carpeta SMB.

## Validación
La PR exige TypeScript, lint, Vitest, web y pruebas Electron en verde antes de fusionar.
