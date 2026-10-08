TrAcción — incremental: popup de denegación + guardado flotante en Ajustes

Cambios incluidos (solo 2 ficheros):

1) src/features/licencias-sin-sueldo/components/LicenciasSinSueldoPage.tsx
   - Al guardar una Licencia sin sueldo pasando a estado Denegada, la denegación se guarda primero.
   - Después aparece un diálogo: "¿Quieres generar ahora el documento de no concesión?"
   - "Generar documento" genera el Word de denegación.
   - "Ahora no" mantiene la denegación guardada y permite generar el Word posteriormente desde el histórico.

2) src/components/AjustesPage.tsx
   - Cuando una ruta de plantilla/exportación cambia y aún no se ha guardado, aparece un botón flotante "Guardar cambios".
   - El botón permanece visible independientemente de la sección de Ajustes en la que esté el usuario.
   - Al guardar utiliza exactamente el mismo flujo de persistencia compartida que ya existía.
   - Los ajustes que se persisten de forma inmediata no generan un falso estado pendiente.

No se modifican esquemas SQLite, Electron, IPC, actualizador, lógica de concesión ni otros módulos.
