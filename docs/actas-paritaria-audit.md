# Auditoría previa Comité → Actas / Comisión Paritaria

Fecha: 2026-06-07.

## Modelos de sesión

- Comité define `CommitteeSession` en `src/features/comite/domain/comite.ts` con `id`, `date`, `code`, `title`, `notes`, `status`, `items`, `treatedTaskIds`, `untreatedTaskIds`, marcas de creación/actualización y `closedAt`.
- La persistencia de sesiones de Comité usa Zustand y `readStorageItem`/`writeStorageItem` sobre `traccion.v1.comite.sessions` en `src/features/comite/store/useCommitteeSessionStore.ts`.
- Las sesiones abiertas se muestran separadas del histórico; las cerradas se ordenan por `closedAt` descendente en la página de Comité.

## Modelos de tareas

- `Task` se define en `src/features/tareas/domain/task.ts` con `fase`, `estado`, `sindicato`, `origen`, `seguimiento`, `closedAt` y borrado lógico.
- Las fases son texto libre, con constantes para `tarea`, `peticion` y `cerrada`.
- Comité selecciona tareas activas cuya `fase` normalizada es `comite`, que no están borradas y no están cerradas.
- El cierre desde Comité marca tareas tratadas como `estado = cerrada`, `fase = cerrada`, añade entrada de seguimiento y conserva no tratadas abiertas.

## Ordenación de puntos

- El orden del día se guarda como array de ids de tareas (`items`) dentro de cada sesión.
- La ordenación manual se realiza moviendo ids arriba/abajo en ese array.
- Las exportaciones de puntos calculan el campo `order` a partir del índice actual de `items`.

## Cierre de sesión

- El cierre abre un modal donde todos los puntos aparecen tratados por defecto.
- Confirmar cierre separa `treatedTaskIds` y `untreatedTaskIds`, fija `status = closed`, `closedAt` y `updatedAt`.
- Después se cierran en el store de tareas únicamente las tareas tratadas.

## Exportación

- La exportación reutiliza `ExportPrintButtons`, `ExportTablePayload`, `ExportColumn`, `sanitizeFilenamePart` y `buildFilterLabel` desde `src/shared/export` y `src/shared/print`.
- La tabla principal de módulos modernos usa `DataTable` con `useTableViewPreferences` para orden y anchos persistidos.

## Impresión

- La impresión se ofrece por `ExportPrintButtons`, que comparte el mismo payload que Excel y genera HTML imprimible con `buildPrintableTableHtml`.

## Persistencia y sincronización

- La capa actual persiste en localStorage y espeja a SQLite mediante `writeStorageItem` si la clave está en `PERSISTED_STORAGE_KEYS`.
- No hay tablas específicas por módulo en frontend; SQLite conserva pares clave/valor.
- La integración debe limitarse a registrar nuevas claves persistidas para Actas y Paritaria.
