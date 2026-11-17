# PR507 · Selector de base de datos al arrancar

## Uso

Cada vez que se inicia TrAcción aparece una pequeña ventana de selección:
**Entrar en Producción** como botón principal, **Abrir entorno de pruebas**
como enlace secundario más pequeño y **Cancelar**. Se muestra antes de abrir la ventana principal
o inicializar SQLite.

- **Producción**: conserva exactamente el perfil local, carpeta SQLite,
  copia de seguridad y UUID vinculado anteriores. La ruta se sigue ajustando
  desde Ajustes, sin migración automática.
- **Pruebas**: utiliza el perfil local separado `userData-test-environment`.
  La primera vez solicita una carpeta **exclusiva de pruebas**. En los
  arranques posteriores ofrece reutilizarla o escoger otra. La ruta se
  almacena en las preferencias del perfil de pruebas, no en producción.
- **Cancelar**: no abre TrAcción ni una conexión SQLite.

Si en la carpeta de pruebas no existe `traccion.sqlite`, la aplicación
genera una **base vacía**, con las mismas migraciones de esquema pero
identidad `environment=test` y UUID propio; no copia ninguna persona,
tarea, ticket, acta o dato del entorno real. La primera creación usa
marcador exclusivo `.test-initialization.lockdir`. Si se interrumpe,
se conserva el marcador: no borrarlo mientras otro proceso pudiera seguir
creando la base. No se sobrescribe una SQLite existente.

## Separación y controles

1. Perfil, caché, preferencias, locks de usuario, copias locales y rutas
   por defecto separados por entorno.
2. Una base con `environment=production` queda rechazada al arrancar en
   modo pruebas, aunque se seleccione esa carpeta por error. Lo inverso
   también se rechaza.
3. Una ruta de prueba idéntica a la carpeta de producción configurada
   se rechaza antes de abrir SQLite (incluidas equivalencias por realpath).
4. El título de la ventana muestra «ENTORNO DE PRUEBAS». El entorno de ensayos añade además una banda azul fija arriba con «ENTORNO DE PRUEBAS · Base de datos ficticia · No es producción» y un borde azul que rodea la aplicación en todos los módulos.
5. Cambiar entre entornos exige cerrar completamente la aplicación y
   volver a abrirla, para no conservar conexiones del entorno anterior.
6. El modo existente `--traccion-test-user-b` sigue siendo una ruta
   de diagnóstico multiusuario separada y NO debe confundirse con esta
   función: usa una base real según su propia configuración.

## Precauciones

- No utilizar la carpeta del sistema de producción como destino de pruebas.
- Para ensayos físicos con dos PCs, ambos deben seleccionar **Pruebas** y
  la misma carpeta SMB *exclusiva de ensayo*.
- El selector no habilita el escritor independiente experimental. Se
  mantiene el flujo normal de SQLite hasta decisión GO/NO-GO.
- Si la base de pruebas no está disponible, el arranque no debe sustituirla
  por datos productivos ni crear una SQLite local de respaldo silencioso.
- En un equipo con un fichero `traccion.sqlite` preexistente, no se migra
  de producción a pruebas: hay que utilizar otra carpeta vacía.

## Pruebas

- Identidad de entorno y esquema de una SQLite ficticia nueva.
- Rechazo de datos de producción en modo pruebas.
- Perfil separado y preferencias de producción intactas.
- Rechazo de carpetas iguales y cancelación sin abrir SQLite.
- Respeto de marcadores de inicialización compartidos.
- TypeScript, Vitest y GitHub Actions antes de fusionar.

## Alcance y rollback

La función es un selector de **base de datos**, no una activación del
writer aislado. Volver a Producción en el siguiente arranque utiliza
el perfil que ya existía sin alterar su fichero SQLite ni su UUID.

## Auditoría SQLite en CI

La nueva apertura nativa del inicializador local de base de pruebas está clasificada expresamente en `scripts/classify-sqlite-routes.mjs` como `test-only-initializer`, con estado `NO-GO` para la cesión productiva. No se desactiva ni se relaja el inventario de aperturas SQLite.
