# Diagnóstico Criterios RRLL

Se buscó la fuente RRLL Dashboard en el entorno de trabajo con `find` y `rg` antes de implementar. No existe una copia del módulo antiguo en `/workspace`, `/tmp` ni `/home`, ni referencias locales a `Criterios RRLL` dentro de TrAccion V1.

Con esa limitación, la implementación queda acotada al patrón de módulo documental equivalente observado en TrAccion V1 y no replica funcionalidades ausentes en el código disponible.

1. Campos aplicados: `tema`, `criterio`, `estado`, `fecha`, `responsable`, `observaciones`, metadatos técnicos `createdAt`, `updatedAt` y `deletedAt` para persistencia y borrado lógico.
2. Acciones: listado, alta, edición, borrado lógico, búsqueda, filtro por estado y ordenación por cabecera.
3. Similitudes con Tareas: tabla compacta, cabecera fija, indicadores de ordenación, filtros superiores, modal compacto y persistencia Zustand + localStorage.
4. No se copia de Tareas: prioridad, fecha límite, origen sindicato, seguimiento/actualizaciones, cierre e histórico de cerradas.
5. Comportamiento replicado: registro documental editable con búsqueda textual, filtro simple por estado, orden por columnas y exclusión de eliminados.
