# Identidad visual de TrAcción

## Dos versiones del logotipo según el tamaño

El logotipo **anterior, simplificado** se utiliza donde la imagen es pequeña: iconos de Windows, pestaña del navegador y barra lateral. El logotipo **nuevo, completo** —con tres engranajes superpuestos, personas, tren, vías y flecha— se utiliza en las pantallas grandes de arranque y cierre.

| Ubicación | Versión | Recurso | Consumidor |
| --- | --- | --- | --- |
| Barra lateral | Anterior (compacta) | `assets/logo/traccion-logo.png` | `src/components/Sidebar.tsx` |
| Icono del EXE / ventana / barra de tareas | Anterior (compacta) | `build/icon/traccion-icon-256.ico` | `package.json`, `electron/main.ts` |
| Favicon en navegador de desarrollo | Anterior (compacta) | `public/favicon.ico` | `index.html` |
| Arranque | Nueva (completa) | `build/icon/traccion-logo.png` | `build/icon/splash.html` |
| Cierre | Nueva (completa) | `build/icon/traccion-splash.png` | `build/icon/shutdown.html` |

**Origen de los iconos compactos:** restaurados byte a byte desde Git, commit `0e428e25e74539d14f86e7c29a38999dd0d0018a`, anterior al cambio de identidad visual de la PR #404. No se han rediseñado, recortado ni recomprimido.

**Origen del logotipo completo:** recursos introducidos por la PR #404, conservados sin alteración.

## Recurso histórico sin uso confirmado

`build/icon/traccion-portable-splash.bmp` se mantiene sin cambios. No se ha localizado una referencia activa en la configuración de distribución portable vigente; no asumir que es el splash de arranque de Electron.

## Mantenimiento futuro

1. Mantener las dos variantes, sin reducir el logotipo completo para tamaños pequeños.
2. Cuando cambien los iconos, revisar en conjunto EXE, barra de tareas, ventana, favicon y barra lateral.
3. Cuando cambie la identidad principal, revisar en conjunto arranque y cierre.
4. Generar el EXE para actualizar su icono incrustado; Windows puede requerir refrescar caché de iconos o volver a anclar el acceso directo.
5. Verificar visualmente en Windows a 16, 24, 32, 48 y 256 px, y comprobar la presentación de arranque y cierre.
6. Documentar como PR exclusivamente visual, sin cambios funcionales. No alterar `docs/FUNCIONAMIENTO.md` si no cambia el comportamiento de la aplicación.
