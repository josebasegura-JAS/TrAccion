# Auditoría UX — avisos, mensajes y guardado

Fecha: 08/10/2026

## Objetivo

Homogeneizar, clarificar y reducir el ruido de feedback de TrAcción sin modificar la lógica de negocio ni la persistencia. Como criterio principal, una acción del usuario debe producir una sola respuesta visual principal.

## Inventario de mecanismos actuales

La aplicación dispone actualmente de varios canales de feedback que se solapan parcialmente:

- `FloatingSaveAction`: acción flotante para cambios pendientes.
- `InlineSaveFeedback`: confirmación breve `Guardado` junto a una acción local.
- `GlobalBusyIndicator`: estados globales `Guardando / Guardado / Error` vinculados a persistencia.
- `Toast`: mensajes temporales `success / info / warning / error`.
- `AppDialog` y `useAppDialog`: alertas y confirmaciones bloqueantes.
- `Notice`: avisos persistentes contextualizados dentro de una pantalla.
- estados y párrafos locales (`status`, `saveStatus`, etc.) definidos por cada módulo.
- banners de infraestructura: conexión, SQLite, bloqueos y edición multiusuario.

El problema principal no es la ausencia de componentes comunes, sino que varios de ellos pueden comunicar simultáneamente el mismo resultado.

## Regla UX objetivo

### Guardado

1. Si no hay cambios, no se muestra ninguna llamada adicional a guardar.
2. Si hay cambios y el botón normal de guardar está visible, se utiliza ese botón.
3. Si el botón normal queda fuera del viewport por scroll, aparece `FloatingSaveAction`.
4. Durante la operación, el propio control cambia a `Guardando…`.
5. El éxito se confirma una sola vez y brevemente como `Guardado`.
6. Un error se muestra una sola vez, permanece el tiempo suficiente para leerlo y explica qué hacer a continuación cuando exista una acción posible.

### Mensajes temporales

Los `Toast` se reservan para resultados puntuales que no sean el guardado normal de un formulario: importaciones, exportaciones, generación de documentos, preparación de correos y operaciones equivalentes.

### Avisos persistentes

`Notice` y banners se reservan para estados que siguen siendo relevantes después de leerlos: conflictos multiusuario, bloqueo de edición, pérdida de conexión, configuración incompleta o incidencias que requieren intervención.

### Confirmaciones

Los diálogos deben utilizar títulos y botones específicos de la acción. Se evitarán, cuando exista contexto suficiente, textos genéricos como `Aviso`, `Confirmar acción`, `Aceptar` u `OK`.

## Hallazgos prioritarios

### P1 — Guardado duplicado o excesivamente técnico

- `GlobalBusyIndicator` todavía puede mostrar textos de infraestructura como `Confirmando el cambio en la base compartida` y `El cambio ha quedado confirmado en SQLite`. Para el usuario normal deben reducirse a estado funcional; SQLite debe reservarse para diagnóstico o incidencias.
- `InlineSaveFeedback` y `GlobalBusyIndicator` ya contienen lógica para no duplicar el éxito, señal de que el sistema tiene más de un canal para el mismo evento.
- `FloatingSaveAction` se ocultaba por la mera existencia de acciones en `PageHeader`, aunque esas acciones estuvieran fuera del viewport. Esto contradice el criterio de que el flotante debe aparecer precisamente cuando el guardado se pierde con el scroll.
- Ajustes mantiene un guardado normal y un guardado flotante para rutas. Deben convivir de forma contextual: el flotante solo cuando el guardado normal no sea visible.
- Coordinación utiliza correctamente el flotante para cambios pendientes de reunión, pero conserva además mensajes locales de `Guardando` y éxito. Deben quedar reservados a advertencias y errores una vez completada la migración.
- Tareas tiene el botón `Guardar` en un footer fijo del modal; por tanto no necesita otro botón flotante. La confirmación inline breve es suficiente.

### P2 — Estados locales heterogéneos

Existen numerosos `status`, `saveStatus` y mensajes específicos en páginas y editores. Deben clasificarse en cuatro grupos: éxito puntual, información, advertencia recuperable y error. El texto de éxito no debe quedarse indefinidamente en pantalla después de una operación normal.

### P2 — Diálogos genéricos

`AppDialog` mantiene valores por defecto `Confirmar acción / Aceptar` y `Aviso / OK`. Son válidos como fallback técnico, pero los flujos de negocio deberían proporcionar título y verbo concretos (`Eliminar`, `Cerrar tarea`, `Quitar de la reunión`, etc.).

### P3 — Toasts

El sistema admite hasta cuatro toast simultáneos. Es útil para operaciones independientes, pero debe evitarse encadenar varios mensajes de éxito producidos por una sola acción.

## Vocabulario estándar

- `Cambios pendientes`
- `Guardar cambios`
- `Guardando…`
- `Guardado`
- `No se ha podido guardar`
- `Cancelar`
- `Eliminar`
- `Cerrar`
- `Descartar cambios`
- `Reintentar`

Se evitarán variantes innecesarias como `Cambios guardados`, `Datos almacenados`, `Actualización realizada` o referencias a SQLite en operaciones normales.

## Plan de implantación

### Fase 1 — Guardados y flotantes

- Hacer que `FloatingSaveAction` responda a la visibilidad real de las acciones fijas, no solo a su existencia en el DOM.
- Permitir que cada pantalla identifique su botón normal de guardar para que el flotante aparezca únicamente cuando ese botón quede fuera del viewport.
- Mantener Tareas sin flotante mientras su footer fijo siga siempre visible.
- Migrar progresivamente Ajustes y Coordinación al patrón común.

### Fase 2 — Confirmaciones y diálogos

- Revisar usos de `useAppDialog`/`AppDialog`.
- Sustituir títulos y botones genéricos por acciones concretas.
- Homogeneizar confirmaciones destructivas y cierres.

### Fase 3 — Toasts, errores y mensajes informativos

- Reservar toast para operaciones puntuales no relacionadas con guardado normal.
- Reducir textos técnicos del indicador global.
- Eliminar éxitos persistentes redundantes.
- Mantener visibles los errores accionables y conflictos multiusuario.

## Criterios de aceptación final

- Una acción normal genera como máximo una respuesta visual principal.
- Nunca aparecen simultáneamente dos confirmaciones verdes para el mismo guardado.
- El usuario siempre dispone de `Guardar cambios` cuando existen cambios pendientes y el guardado normal ha salido del viewport.
- Los errores no desaparecen antes de poder leerse o actuar sobre ellos.
- Los mensajes técnicos de SQLite no aparecen en operaciones correctas de uso diario.
- Los diálogos indican claramente qué ocurrirá al pulsar su botón principal.
