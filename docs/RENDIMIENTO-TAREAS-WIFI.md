# Auditoría y comprobación de rendimiento — Tareas sobre SMB/Wi-Fi

## Alcance de esta PR
- Editar, eliminar y actualizar el seguimiento de una tarea desde Coordinación ya no requiere `readTasksForStore('all')` para todo el histórico: consulta un registro por `task_records.id` (clave primaria).
- La operación de escritura conserva su comprobación optimista de versión mediante `updated_at` y no reintenta automáticamente errores de E/S.
- Carga inicial e histórico siguen usando los filtros existentes. Exportaciones Excel, backups y sincronización multiusuario permanecen intactos.
- El renderer registra en la consola `[tareas-perf]` para operaciones SQLite de carga o guardado de al menos 250 ms, sin incluir identificadores de empleados ni contenido de tareas.

## Cómo medir en Windows
1. Guardar una copia de seguridad. Usar el mismo volumen de datos y la misma red para comparar.
2. Abrir las herramientas de desarrollo de Electron (si el entorno las permite) y filtrar mensajes por `[tareas-perf]`.
3. Repetir en cable y Wi-Fi: abrir Tareas, abrir una tarea, modificarla y guardar; eliminar una tarea **de prueba**; actualizar un seguimiento desde Coordinación.
4. Para cada caso, registrar tiempos de lectura y guardado en milisegundos; repetir al menos cinco veces y comparar la **mediana** y el valor máximo.
5. Verificar con dos usuarios que un cambio simultáneo sigue mostrando conflicto, sin sobrescribir datos.
6. Si el guardado sigue lento, comprobar por separado la actualización automática del Excel (programada tras guardado) y los respaldos SQLite; no desactivarlos sin una evaluación de seguridad.

## Interpretación
- El tiempo registrado es el tiempo percibido de la llamada IPC desde el renderer; puede incluir espera en cola, bloqueo SMB y ejecución de SQLite.
- Una medición de menos de 250 ms no se registra, lo que limita estas trazas a operaciones lentas.
- No atribuir la mejora a SMB ni al tamaño de los datos sin comparar mediciones reales.
- Esta PR no elimina los costes de recarga del histórico cuando se abre expresamente ni los backups.
