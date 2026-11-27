# Fase C — comprobación de aislamiento de salidas

La prueba de integración electron/testOutputIsolation.integration.test.ts utiliza directorios temporales hermanos y archivos centinela de producción sintética. Ejecuta el IPC real de Excel operativo con configuración de destino heredada, el publicador real y el generador real de Excel de Tareas. Solo sustituye el estado SQLite y el registro IPC de Electron. Verifica redirección manual, poda limitada, rechazo de exportación automática, base inactiva y junctions, y compara nombres y contenido de los centinelas. No necesita Office ni SMB.

## Aceptación manual antes de main

- Con EXE experimental y base ficticia, comprobar Ajustes y rutas visibles, exportación manual de cada módulo y destino efectivo; no utilizar la base real como centinela.
- Verificar Ayuda escolar, Lotería, descargas y documentos vinculados; comprobar rechazo de Outlook real y actualización automática.
- Verificar backups manuales, diarios y de cierre con dos perfiles; comprobar centinelas y restauración bloqueada.
- Repetir con desconexión/reconexión SMB y permisos de escritura restringidos. No probar con datos reales.
- Office Guardar como fuera de TrAcción y cambios concurrentes de enlaces por otros procesos no están controlados; separar permisos SMB si se requiere garantía a nivel del sistema.

Esta PR no cambia código funcional ni afirma que todos los canales estén cubiertos. CI y aceptación manual pendientes.


## D5 — documentos de revisión

Word y Excel manuales comparten validación, creación exclusiva y comprobación de identidad/ruta de PRUEBAS antes de entregar el documento a Office. Si la apertura devuelve un error confirmado, se intenta retirar únicamente el archivo de ese intento y su carpeta vacía. Si cambia la identidad o el destino, o el resultado de la entrega es incierto, se conserva el archivo. Nunca se eliminan automáticamente documentos abiertos correctamente: Office puede mantenerlos abiertos o contener cambios no guardados. La limpieza de documentos de revisión antiguos debe hacerse manualmente tras cerrar Office, dentro de las carpetas autorizadas; no borrar de forma recursiva directorios compartidos.

Las pruebas de integración utilizan archivos reales y sustituyen shell.openPath; verifican ambos formatos, fallo de apertura, contenido vacío, base inactiva y enlaces. No validan Word/Excel instalados ni la red SMB.

Antes de cerrar la versión, comprobar manualmente los mensajes de exportación automática omitida en Lotería y restantes canales externos; no cambiar el contrato IPC sin verificar sus consumidores.
