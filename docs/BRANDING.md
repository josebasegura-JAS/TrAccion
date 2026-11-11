# Identidad visual de TrAcción

## Recursos activos

El logotipo aprobado (engranajes rojos, plateados, tren, personal y flecha sobre fondo azul oscuro) se utiliza en estos archivos:

| Ubicación | Archivo | Consumidor |
| --- | --- | --- |
| Barra lateral | `assets/logo/traccion-logo.png` | `src/components/Sidebar.tsx` |
| Arranque | `build/icon/traccion-logo.png` | `build/icon/splash.html` |
| Cierre | `build/icon/traccion-splash.png` | `build/icon/shutdown.html` |
| Ejecutable / ventana / barra de tareas | `build/icon/traccion-icon-256.ico` | `package.json` y `electron/main.ts` |
| Navegador durante desarrollo | `public/favicon.ico` | `index.html` |

El archivo `build/icon/traccion-portable-splash.bmp` es un recurso anterior de distribución: **no se ha encontrado referencia activa** en la configuración portable vigente. No se cambia ni se presupone que forma parte del arranque.

Las imágenes PNG activas se distribuyen en tamaño 512 × 512, suficiente para los tamaños actuales de la interfaz; el ICO contiene el mismo logotipo en recursos de icono de Windows. El arte aprobado de mayor resolución se conserva por separado en el paquete de origen.

## Para futuras actualizaciones

1. Cambiar todos los PNG e ICO activos en una única PR; mantener coherentes los recursos Windows y los de la interfaz.
2. Revisar `Sidebar.tsx`, `splash.html`, `shutdown.html`, `electron/main.ts`, `package.json` e `index.html` por si han cambiado las rutas.
3. Compilar un EXE nuevo: Windows incrusta el icono en el ejecutable; sustituir solo el PNG no basta.
4. Comprobar barra lateral, pantalla de arranque, pantalla de cierre, archivo EXE en Explorador, barra de tareas y pestaña del navegador; examinar el resultado a 16, 32 y 48 px.
5. Si un acceso directo o icono anclado mantiene la imagen antigua tras actualizar, comprobar la caché de iconos de Windows y volver a anclar.
6. Al tratarse de un cambio solo gráfico, documentar en la PR `sin cambios funcionales`; no modificar `docs/FUNCIONAMIENTO.md` salvo que cambie un comportamiento de usuario.
