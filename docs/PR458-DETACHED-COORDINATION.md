# PR458 — Coordinación atómica en utilityProcess (ruta no productiva)

## Implementación
- `detachedCoordinationWorkflowCore.ts` invoca **sin duplicación SQL** los cores de PR457: cierre conjunto de reunión/índice/tareas y creación vinculada de tarea/reunión/índice.
- Validación estricta: operación `close` o `create-task`, propietario no vacío, claves de reunión e índice distintas, OCC explícito, tareas válidas, máximo 1000 y sin IDs repetidos.
- Protocolo `detached:coordination-workflow` / `detached:coordination-workflow-done` con respuestas tipadas.
- Worker despacha el mensaje dentro de la misma cola FIFO, sin permitir cierre de la conexión antes de resolver la operación.
- Runner exige `ready → open → save → close → exit(0)`. Ante error, mensaje ajeno o muerte del hijo: resultado **incierto**, sin reintentos automáticos.
- Bridge disponible para un coordinador futuro; no se conecta al IPC ni al main de producción.

## Pruebas
SQLite nativo para ambos workflows: éxito, conflictos OCC, tarea ya existente, error SQL inducido con rollback. Pruebas de protocolo: mensajes y respuestas malformadas, duplicados, propietario inválido. Runner: éxito solo al observar `exit(0)`, salida inesperada y operationId ajeno.

## Bloqueantes previos a activación
El child **NO** adquiere ni renueva el lock SMB, ni agenda backups. Se exige cesión exclusiva verificada, identidad de base y esquema, drenaje de todas las actividades, lock distribuido, recuperación de escritura incierta y agenda de backup post-confirmación. Mantener desactivado el handoff en producción. La comprobación adicional de locks de edición de Tareas para las operaciones de Coordinación merece revisión específica antes de activación: esta PR conserva la semántica productiva existente.

## Próximos pasos
Portar restantes repositorios especializados, finalizar propietario único/SMB, ensayar cortes de red y comparar métricas antes de habilitar.
