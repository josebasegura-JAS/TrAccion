# PR 4 — Avisos contextuales por módulo

Esta PR aplica la primera migración conservadora de módulos al contrato visual de las PR 1–3.

## Tareas: estado del bloqueo en la cabecera

- **Bloqueo adquirido:** el mensaje `Edición bloqueada para otros usuarios mientras esta ventana esté abierta.` deja de mostrarse como una banda ámbar en todo el ancho del editor.
- La cabecera muestra la indicación breve **Edición reservada**, junto al estado de SQLite. El mensaje completo permanece en el título accesible del indicador.
- **Bloqueo no adquirido, error o modo consulta:** continúa el aviso contextual visible en el formulario, con explicación y edición deshabilitada.
- No se cambian `useSharedRecordLock`, renovaciones, TTL, permisos, guardados ni la condición `isFormReadOnly`.

## Lotería: dos advertencias persistentes

- El conflicto de campaña sigue impidiendo sobrescribir el borrador remoto; conserva la acción de descartarlo.
- El respaldo Excel pendiente sigue indicando explícitamente que SQLite sí guardó los datos.
- Ambas situaciones utilizan `InlineNotice`, con color y tipografía coherentes con la paleta general.
- Los mensajes de estado de campaña siguen en `SaveState`, sin reclasificarlos automáticamente: `setMessage` mezcla confirmaciones, errores y validaciones y necesita migración individual por flujo para no tratar un error como éxito.

## Componente común

`src/components/ui/InlineNotice.tsx`: mensaje inline no intrusivo con tonos `info`, `warning` y `error`, acción opcional y semántica accesible. Su prueba verifica la diferenciación entre estado y error.

## Pendiente de migración controlada

El resto de notificaciones locales de módulos, especialmente formularios de Ticket Restaurante, Comité, Paritaria y Especiales, **no quedan declarados completamente migrados**. Se mantienen las confirmaciones existentes y los mensajes que protegen integridad de datos. Antes de reemplazarlos debe asociarse cada cadena a su resultado funcional y validarse con pruebas de módulo. Esta PR evita una sustitución masiva de mensajes mediante expresiones regulares sin garantías.

## Validación requerida

- Ejecutar CI: ESLint, TypeScript, Vitest, build, Playwright.
- Abrir tarea con bloqueo adquirido: la banda ámbar habitual no aparece y se ve `Edición reservada` en cabecera.
- Abrir la misma tarea desde un segundo equipo: sigue en modo consulta, con advertencia contextual y sin posibilidad de guardar.
- Simular caída SMB durante una edición: permanece el bloqueo de escritura establecido por el código actual.
- Lotería: conflicto de campaña mantiene la opción de cargar datos compartidos; respaldo Excel pendiente no se confunde con guardado SQLite fallido.
