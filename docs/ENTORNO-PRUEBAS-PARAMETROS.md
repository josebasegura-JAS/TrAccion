# Entornos independientes por parámetro — Producción / Pruebas

## Funcionamiento

- **Producción** (sin parámetro, comportamiento anterior): acceso directo al ejecutable habitual. Se mantienen userData, SQLite, backups y actualizaciones previas.
- **Pruebas**: el mismo ejecutable se inicia con `--traccion-env=test`. Antes de importar `main.js`, Electron cambia `userData` a otro directorio (`-entorno-pruebas`). No copia `sqlite-preferences.json` ni la identidad de usuario de producción.
- **Perfil B**: el parámetro ya existente `--traccion-test-user-b` sigue siendo una función *diferente* y puede copiar las preferencias del perfil activo para simular un segundo cliente. **No utilizarlo como sustituto del entorno aislado**, especialmente sin `--traccion-env=test`.
- No existe selector inicial ni cambio de entorno con la app en ejecución. Es el acceso directo quien decide el entorno antes de establecer la conexión.

## Accesos directos de Windows

En el destino del acceso directo (comillas en la ruta si tiene espacios):

**Producción:** `"C:\\Ruta\\Traccion.exe" --traccion-env=production`

**Pruebas:** `"C:\\Ruta\\Traccion.exe" --traccion-env=test`

También funciona Producción sin parámetro, conservando los accesos anteriores.

**No usar un ejecutable distinto que comparta el mismo perfil:** son los parámetros anteriores los que permiten la separación; un nuevo .exe sin argumento seguirá siendo Producción.

## Primer arranque de Pruebas

1. Cerrar TrAcción antes de modificar los accesos directos. Mantener copia de seguridad de la base real.
2. Crear en la unidad SMB una **carpeta completamente separada** de producción, por ejemplo `...\\TrAccion_Ensayo`. No copiar `traccion.sqlite` de producción.
3. Iniciar el acceso directo **Pruebas**. Aparecerá el título `PRUEBAS · BASE AISLADA`. La primera vez no hay ruta configurada: la aplicación puede abrir en modo consulta/bloqueado.
4. En **Ajustes**, seleccionar la carpeta de ensayo. Si aún no hay SQLite, la aplicación crea la base **vacía** con su esquema y marca `environment=test` y UUID propio. Si se selecciona por error una carpeta con SQLite de producción, se rechaza *antes de escribir en la base o adquirir su lock*.
5. Cerrar y reabrir Pruebas; comprobar una tarea ficticia. Después abrir Producción con su acceso habitual y verificar que sigue intacta.
6. En el segundo ordenador, usar el mismo argumento `--traccion-env=test`, seleccionar la **misma carpeta de ensayo** y repetir comprobaciones. Cada equipo usa perfil local separado, ambos comparten solo SQLite test.

## Salvaguardas

- El entorno se fija antes de abrir SQLite; los flags ambiguos se rechazan.
- La base `production` y `test` nunca se intercambian; se valida la identidad existente *antes* de tomar el lock de arranque, migrar o respaldar.
- Las SQLite legadas sin identidad se rechazan en Pruebas. Solo una base **nueva y ausente** se inicializa vacía como `test`.
- Cambiar de carpeta estando en Pruebas **no copia** la base anterior ni importa producción.
- La restauración de backups (incluido JSON) está **desactivada íntegramente en Pruebas**, hasta auditar los orígenes y destinos.
- La liberación administrativa de un lock en Pruebas exige comprobar previamente que el archivo SQLite tiene identidad `test`; nunca opera sobre la base real si se seleccionó por error.
- Las actualizaciones automáticas quedan desactivadas para Pruebas; el ejecutable experimental debe ser instalado manualmente por IT.
- Los logs y backups locales usan el perfil de prueba; los bloqueos SMB se crean junto al archivo SQLite test, no en el directorio de Producción.

## Qué no se ha demostrado todavía

- El comportamiento real en dos clientes Windows conectados a una carpeta SMB (sin ensayo real, no certificar producción).
- La compatibilidad del actualizador portable y accesos directos tras instalar una nueva versión: se debe verificar en Windows.
- El modo cliente B legado `--traccion-test-user-b` puede trabajar con la BASE REAL si se usa sin `--traccion-env=test`; no es un modo seguro de pruebas aisladas.
- No generar automáticamente una copia con datos personales desde producción. Si se necesitan datos representativos, importar solo datos ficticios o anonimizados mediante un proceso auditado.
- La rama `fix/sqlite-lock-owner-safe-write-pr526` está separada: no se prueba una corrección no fusionada por el mero hecho de crear el entorno; primero hay que generar un EXE experimental de esa versión.

## Pruebas de aceptación antes de fusionar/desplegar

1. Sin flags: perfil de producción anterior y misma base.
2. `--traccion-env=test`: perfil distinto, no hay preferencia de producción copiada.
3. Seleccionar base `production` en Pruebas: error seguro y ninguna escritura.
4. Seleccionar base `test` en Producción: error seguro y ninguna escritura.
5. Crear carpeta de ensayo vacía desde Ajustes: inicialización `test`, UUID independiente y conexión funcional.
6. Reiniciar test/producción: conserva las identidades y la separación.
7. Intentar restaurar cualquier backup desde Pruebas: operación bloqueada.
8. Intentar aplicar una actualización automática en Pruebas: bloqueada.
9. Dos clientes Windows con SQLite test sobre SMB: guardar y leer tareas simultáneas y probar cortes de red sin tocar producción.
