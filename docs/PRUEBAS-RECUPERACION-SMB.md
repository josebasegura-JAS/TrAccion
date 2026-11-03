# Prueba controlada: cambio Ethernet ↔ Wi-Fi con SQLite en SMB

## Antes de empezar (obligatorio)
- Realizar primero la prueba con una **copia de la base compartida** en una carpeta SMB de pruebas, nunca con la base de producción ni con sus copias de seguridad originales.
- Usar el ejecutable construido desde la rama de estas PR y confirmar que #325 y #326 están incorporadas.
- Preparar dos equipos Windows (si es posible), dos usuarios TrAcción y una ruta SMB de pruebas accesible tanto por cable como por Wi-Fi.
- **No borrar** `.lockdir`, `owner.json`, `-journal` ni forzar desbloqueos mientras exista una escritura pendiente.
- Guardar una copia anterior de la base y anotar su identidad/ubicación; no restaurar archivos sobre una base que esté abierta.

## Matriz de pruebas

| Caso | Preparación | Acción | Resultado obligatorio |
| --- | --- | --- | --- |
| 1. Cambio cable → Wi-Fi | TrAcción abierta, conexión y datos verificados | Desconectar cable con Wi-Fi encendido | Si se pierde el acceso SMB, se bloquea la edición; al recuperarlo, se valida la base y se sincronizan datos antes de desbloquear |
| 2. Wi-Fi → cable | TrAcción abierta y conectada por Wi-Fi | Conectar cable y desactivar Wi-Fi | Misma recuperación y sin duplicados |
| 3. Corte durante lectura | Abrir Lotería o Tareas | Cortar conexión antes o durante la lectura, recuperar | Puede aparecer error de consulta; posteriormente carga actualizada; nunca se presenta un falso guardado correcto |
| 4. Corte durante escritura | Crear un registro ficticio en base de pruebas | Interrumpir SMB durante el guardado | No se anuncia como guardado si no hay confirmación; no pulsar de nuevo hasta inspeccionar el registro |
| 5. Corte prolongado | Dejar abierta la aplicación | Mantener la ruta SMB inaccesible durante varios intentos | Se mantiene bloqueo de edición, ayuda disponible y diagnóstico copiable |
| 6. Segundo usuario | Abrir el mismo recurso desde dos PCs | Ejecutar lecturas y una escritura de prueba, con corte en uno | Sin cambios parciales ni desbloqueos falsos; otro usuario no debe sufrir reescritura silenciosa |
| 7. Archivo distinto | Con TrAcción desconectada, preparar un recurso de pruebas con un UUID diferente | Recuperar acceso apuntando a ese recurso | TrAcción debe rechazarlo y mantener edición bloqueada |
| 8. Guardado con resultado incierto | Simular demora > tiempo límite en pruebas controladas | Reanudar SMB | La operación debe finalizar o permanecer indeterminada antes de reabrir; nunca repetir el guardado automáticamente |

## Secuencia sugerida para las pruebas 1 y 2
1. Confirmar que TrAcción muestra datos actuales en dos módulos. Anotar un registro testigo de la copia.
2. Cambiar de interfaz de red sin cerrar TrAcción. No apagar la máquina y no cambiar la ruta SMB configurada durante la prueba.
3. Observar el encabezado de conexión: **interrumpida → verificando/actualizando → recuperada**. Puede no verse interrupción si Windows mantiene la sesión SMB sin corte; anotarlo como tal, no como prueba de recuperación.
4. Comprobar que la edición estaba bloqueada cuando la ruta SMB no respondía.
5. Una vez recuperada, comparar los registros testigo y abrir Lotería y Tareas para confirmar lecturas desde la base compartida.
6. Copiar el diagnóstico cuando haya error. Anotar el mensaje exacto y si fue necesario el botón **Comprobar ahora** o un reinicio seguro.

## Comprobaciones de seguridad de datos
- Comparar el recuento y contenido del registro de prueba antes y después.
- Confirmar que no hay registros duplicados y que ningún guardado se afirma como correcto sin confirmación.
- En una operación de resultado incierto, **consultar desde otra sesión** el estado guardado antes de cualquier intento manual adicional.
- No forzar el cierre si hay una escritura pendiente sin resolver, salvo como último recurso de recuperación y dejando constancia del resultado incierto.

## Qué enviar cuando falle
- Versión del ejecutable y PR incluidas.
- Hora y caso exacto (cable→Wi-Fi, Wi-Fi→cable, lectura o escritura).
- Estado del recurso compartido desde el Explorador de Windows.
- Texto de **Qué hacer y diagnóstico → Copiar diagnóstico**.
- Si otra sesión pudo leer la base y si quedó algún guardado incierto.
- **No compartir** el archivo SQLite ni datos personales; revisar rutas y nombres del informe antes de remitirlo.

## Qué demuestran y qué no demuestran las pruebas automáticas
Los tests de Vitest simulan `SQLITE_IOERR`, retrasos y finalización de operaciones en la **cola IPC**, y verifican transacciones/reapertura con `better-sqlite3` en una base local temporal. **No simulan un corte físico de SMB**, ni certifican por sí mismos que Windows reabra correctamente un archivo después de cambiar de adaptador. Esa evidencia solo la aportan estas pruebas de campo.
