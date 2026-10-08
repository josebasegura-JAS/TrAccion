# Persistencia granular de Coordinación

Desde FASE 4, `traccion.v1.coordinacion.state` queda como formato legado de migración.

El estado activo se divide en:

- `traccion.v1.coordinacion.index`: orden/identificadores de reuniones y colas de tareas (`directionTaskIds`, `unionTaskIds`, `areaTaskIds`).
- `traccion.v1.coordinacion.meeting.<meetingId>`: una reunión completa por registro.

## Migración

Mientras no exista el índice, la lectura usa el snapshot legado. La primera escritura valida primero ese snapshot con el control optimista existente y, si se confirma, crea los registros por reunión y finalmente el índice.

## Concurrencia

Editar puntos o datos generales de una reunión escribe únicamente su clave de reunión. Dos reuniones distintas ya no comparten `updatedAt`.

Las operaciones que también cambian el índice/targets conservan control optimista independiente. Si el índice falla después de modificar una reunión existente, se intenta restaurar automáticamente la versión anterior de esa reunión.

Al eliminar una reunión, el índice es la autoridad: el registro individual puede quedar huérfano, pero deja de formar parte del estado y no se carga. Se evita así una eliminación parcial entre dos registros.
