TrAcción 1.2.164 — incremental cabecera compacta global

Copiar estos archivos respetando exactamente sus rutas desde la raíz del proyecto:
- src/components/Header.tsx
- src/components/ModuleHelp.tsx

Cambios:
- Cabecera principal reducida de 3 líneas visuales a 2: breadcrumb + título.
- Eliminada la descripción inferior del módulo en la cabecera principal.
- Altura y paddings reducidos para aproximar la cabecera a la referencia visual del logo de TrAcción.
- Icono de ayuda ? reducido y menos dominante.
- Icono de módulo ligeramente compactado.
- Campana, avatar, nombre de usuario y estado compactados para mantener el equilibrio vertical.
- Se conserva buscador, avisos de tareas, estado de conexión/sincronización y toda la lógica existente.
- El cambio se aplica desde el Header común, por lo que afecta a todos los módulos que usan la cabecera principal de TrAcción.

No se modifica lógica de negocio ni persistencia.

Validación:
- Revisión diferencial manual realizada sobre los dos archivos modificados.
- No se pudo completar typecheck/lint en este entorno porque la instalación de dependencias del proyecto agotó el tiempo disponible; los cambios son exclusivamente de JSX/clases Tailwind y no alteran firmas ni tipos públicos.
