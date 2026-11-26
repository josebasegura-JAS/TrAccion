# Fase C — comprobación de aislamiento de salidas

La prueba de integración electron/testOutputIsolation.integration.test.ts utiliza directorios temporales hermanos y archivos centinela de producción sintética. Ejecuta el IPC real de Excel operativo con configuración de destino heredada, el publicador real y el generador real de Excel de Tareas. Solo sustituye el estado SQLite y el registro IPC de Electron. Verifica redirección manual, poda limitada, rechazo de exportación automática, base inactiva y junctions, y compara nombres y contenido de los centinelas. No necesita Office ni SMB.

## Aceptación manual antes de main

- Con EXE experimental y base ficticia, comprobar Ajustes y rutas visibles, exportación manual de cada módulo y destino efectivo; no utilizar la base real como centinela.
- Verificar Ayuda escolar, Lotería, descargas y documentos vinculados; comprobar rechazo de Outlook real y actualización automática.
- Verificar backups manuales, diarios y de cierre con dos perfiles; comprobar centinelas y restauración bloqueada.
- Repetir con desconexión/reconexión SMB y permisos de escritura restringidos. No probar con datos reales.
- Office Guardar como fuera de TrAcción y cambios concurrentes de enlaces por otros procesos no están controlados; separar permisos SMB si se requiere garantía a nivel del sistema.

Esta PR no cambia código funcional ni afirma que todos los canales estén cubiertos. CI y aceptación manual pendientes.
