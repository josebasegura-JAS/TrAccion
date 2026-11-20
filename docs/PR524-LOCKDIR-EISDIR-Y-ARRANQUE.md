# PR524 · Recuperación de `.lockdir` incompleto y desbloqueo del arranque

## Incidente verificado (20/11/2026, Wi-Fi)
Captura: ventana de inicio al 80 % con «Conectando y verificando base de datos» en error:
`El directorio de bloqueo SQLite existe, pero sus metadatos no se han podido leer todavía: EISDIR ... illegal operation on a directory, read`.

### Causa comprobada en código
- `databaseLockManager.readLock()`: tras fallar `readFile(lockdir/owner.json)`
  por ausencia de archivo, intentaba `readFile(lockdir)` por compatibilidad
  con el formato antiguo como archivo JSON. El formato actual es un directorio:
  de ahí `EISDIR`. No prueba una caída física del Wi-Fi.
- `initializeSqlitePersistence()`: en el `catch` de activación volvía a
  ejecutar `await readLock(lockPath)` sin un `catch` propio. El segundo error
  salía de `initializeSqlitePersistence()`.
- `main.ts`: `Promise.all(...)` rechazaba y su `catch` solo registraba el
  error; **no creaba la ventana principal**. El splash no tenía botón de salida
  visible por tener `frame:false`.
- `checkSqliteHealth()`: cuando `status.ready === false`, se limitaba a devolver
  el error, sin intentar reactivar una conexión que falló durante el arranque.

## Correcciones
1. Diferenciar con `stat` entre un fichero `.lockdir` legado y el
   directorio moderno antes de abrirlo. Reportar **owner.json ausente** en
   lugar de tratar un `EISDIR` esperado como error de red.
2. Recuperación limitada de un directorio **realmente vacío**: dos lecturas
   `readdir` limpias, observación monotónica de al menos **5 segundos**
   y eliminación con **`rmdir` atómico** (falla si aparece `owner.json`
   o cualquier otro archivo entre la comprobación y el borrado).
   No se usa `rm -r`, `unlink(owner.json)` ni se toca un propietario válido,
   archivos corruptos, cuarentenas o un lease local todavía activo.
   Si SMB deniega la operación, se preserva el bloqueo.
3. En un fallo de arranque, el diagnóstico del lock no puede lanzar una segunda
   excepción sin capturar. La aplicación conserva `ready:false` y la edición
   deshabilitada.
4. Los servicios IPC se registran independientemente; si están operativos,
   **se crea siempre la ventana principal**, aunque la inicialización SQLite
   haya fallado. Se muestra el error de conexión, no un 80 % permanente.
5. Si se recupera posteriormente la red/lock, `health-check` reintenta activar
   la base compartida cada **30 segundos**; solo vuelve a habilitar la edición
   después de validar esquema, identidad y salud. Nunca repite escrituras
   de resultado indeterminado.
6. Para un fallo verdaderamente fatal de los servicios IPC, el splash informa
   del error y presenta «Cerrar TrAcción», en vez de quedar atrapado.

## Riesgos y límites
- La recuperación atómica de carpetas vacías reduce riesgos, pero **no es
  una prueba absoluta de que otro proceso no estuviese intentando crear
  `owner.json`**. Si lo estaba haciendo, su escritura debería fallar tras el
  `rmdir` y ese proceso no debería confirmar la adquisición del lock.
  Por eso la operación espera, comprueba y no elimina archivos.
- Un `owner.json` corrupto o archivos adicionales impiden la recuperación:
  requieren revisión administrativa y no autorizan escrituras.
- Si SMB nunca vuelve a responder, no puede mantenerse el acceso compartido
  ni continuar guardando; solo se podrá consultar la interfaz en modo seguro.
- Las pruebas locales no equivalen a una simulación de las semánticas de
  Windows SMB por Wi-Fi. Validar con **base de ensayo**, sin tocar producción.
- No corregimos aquí otros puntos de E/S nativa que podrían congelar el hilo
  principal; aislar SQLite en otro proceso sigue siendo una mejora pendiente.

## Verificaciones y pruebas
- Nuevo test del `EISDIR` específico y lectura correcta del directorio.
- Reclamación diferida de lockdir vacío; protección ante archivos adicionales.
- Carrera `readdir -> rmdir`: aparece `owner.json` y se conserva al propietario.
- Caracterización SQLite real: arranque desde directorio vacío y recuperación
  mediante health-check desde estado inicial no disponible.
- GitHub Actions: TypeScript, ESLint, Vitest y pruebas Electron.
