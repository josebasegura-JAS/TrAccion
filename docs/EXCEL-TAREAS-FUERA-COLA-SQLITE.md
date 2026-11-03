# PR — Excel de Tareas fuera de la cola SQLite

## Alcance
La lectura consistente de Configuración y de tareas abiertas sigue dentro de
`enqueueSqliteIpc('tasks:load-records', ...)`. La creación y escritura del Excel
con ExcelJS se ejecuta después de liberar esa cola. De ese modo no se retiene
la cola global SQLite durante la E/S potencialmente lenta del archivo.

Las solicitudes automáticas (debounce existente) y manuales (refrescar,
seleccionar carpeta) se serializan **por proceso Electron** mediante
`createSerialTaskExcelQueue`. El snapshot se toma al iniciar cada trabajo,
evitando que un archivo anterior sobrescriba el siguiente dentro del mismo
proceso.

## Qué se conserva
- Formato y nombre del Excel, tres hojas, datos y seguimiento
- Carpeta configurada, mensajes de error y actualización al guardar
- Cola SQLite para leer, control de versiones al guardar y backups
- Sin reintentar automáticamente escrituras indeterminadas

## Comprobaciones propuestas sobre copia de datos
1. Abrir dos ventanas o usar dos estaciones con la **misma base de prueba**.
2. Guardar una tarea con el Excel ubicado en una carpeta SMB lenta.
3. Mientras el Excel está en escritura, guardar otra tarea; el segundo guardado
   no debe esperar innecesariamente a la escritura del fichero Excel.
4. Ejecutar actualización manual durante una exportación automática y
   comprobar que el resultado final incorpora el cambio posterior.
5. Simular carpeta Excel inaccesible. El fallo debe notificarse y una
   actualización manual posterior debe funcionar al recuperar la ruta.
6. Verificar que no se pierde el histórico y que los conflictos de edición de
   dos usuarios siguen rechazándose.

## Límites
- La cola Excel es **local a cada proceso**: dos estaciones distintas aún
  pueden intentar escribir simultáneamente el mismo fichero compartido.
  Esta PR no crea un bloqueo de archivo entre equipos ni resuelve esa carrera.
- El trabajo síncrono de construir el libro en el proceso principal puede
  consumir CPU. Separarlo de la cola SQLite reduce espera de operaciones
  encoladas, pero no lo mueve a otro hilo.
- No se aportan benchmarks reales por Wi-Fi. Medir tiempos en la instalación
  antes de concluir una mejora numérica.
