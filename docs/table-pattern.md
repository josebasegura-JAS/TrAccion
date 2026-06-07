# Patrón de tablas TrAccion

`DataTable` es el componente común para nuevas tablas y migraciones.

Reglas:
- Usar `DataTable` con `useTableViewPreferences` para ordenación, anchura de columnas y persistencia en `localStorage`.
- No añadir líneas verticales ni horizontales internas a las filas. La lectura se apoya en cebreado de filas y hover suave.
- Mantener las columnas de acciones compactas, no redimensionables y alineadas a la derecha.
- Definir `width`, `minWidth` y `maxWidth` en cada columna para evitar scroll horizontal salvo que sea inevitable.
- Añadir una acción discreta de `Restablecer vista` cuando la tabla persista preferencias.
- No crear tablas nuevas con `<table>` manual salvo listados auxiliares muy pequeños y justificados.
