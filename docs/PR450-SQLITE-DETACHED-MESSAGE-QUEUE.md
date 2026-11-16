# PR450 · Secuenciación estricta del escritor SQLite aislado

## Problema
El controlador de mensajes de utilityProcess era `async`. Node no espera las promesas de los listeners de eventos: una petición de cierre podía ejecutarse mientras `saveDetachedTaskRecord` aún estaba pendiente. Se corría el riesgo de cerrar la conexión antes de finalizar ese guardado. El adaptador estaba preparado pero no conectado a producción.

## Cambio
- Cola FIFO por proceso: cada mensaje espera el asentamiento completo de la promesa anterior.
- El cierre queda detrás de cualquier guardado anterior (incluidas llamadas asíncronas).
- Excepciones no contempladas causan fallo cerrado, sin tramitar peticiones pendientes.
- Pruebas sobre guardado pendiente y cierre, y fallo con peticiones en cola.

## Límites
No se cambia el camino de escritura de producción. No se autoriza todavía propiedad SQLite compartida, liberación de lock SMB por timeout ni repetición automática ante resultado incierto. La cola no suple la validación de identidad, gestión de lock distribuido, drenaje de E/S ni pruebas de dos clientes Windows.

## Comprobaciones
Validar TypeScript, ESLint, Vitest y Electron en CI antes de fusionar.
