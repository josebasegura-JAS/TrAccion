# PR 4 — Diagnóstico de latencia de Comité y Paritaria (Wi-Fi / SMB)

## Objetivo y criterio de medición
La aplicación utiliza el buffer `performanceMetrics` ya existente. La nueva
categoría `sesiones` registra **módulo, nombre fijo de operación, resultado y
duración en milisegundos**. No hay telemetría externa ni escritura de métricas
en la base compartida. El buffer solo conserva los últimos 40 registros.

Se instrumentan, para ambos módulos:
- apertura del listado de sesiones;
- lectura del histórico;
- sincronización/recarga de sesiones;
- alta, actualización, eliminación y reapertura individuales;
- lectura selectiva de los puntos vinculados;
- duración de la llamada de cierre transaccional SQLite;
- duración de generación/publicación del resumen Word solicitada al IPC.

La medición está alrededor de los puntos de entrada async, por lo que
incluye esperas IPC/SMB de esa operación. **No equivale** a medir solo el
tiempo de SQL ni separa CPU, red y tiempo de espera del bloqueo.

Se registra `fallo` cuando una promesa rechaza, o el IPC de Word/cierre
devuelve `ok: false`. Las lecturas que fallan siguen conservando el
snapshot válido previo; no hay cambios a los reintentos ni al guardado.

## Privacidad y límites
No se incluyen identificadores, nombres, títulos, datos personales, rutas,
códigos de sesión, punto del orden del día ni mensajes de excepción.
La instrumentación solo registra etiquetas constantes y duraciones. No
activa logs detallados por defecto ni crea archivos de diagnóstico.

## Protocolo de medición en copia de datos
1. Preparar copia de la base SQLite y copias de los Word de ambos módulos.
2. En un PC cableado, abrir cada módulo, editar una sesión, añadir/reordenar
   puntos, abrir Históricos, buscar una sesión antigua, cerrarla de prueba
   y generar su Word. Registrar métricas por operación.
3. Repetir con otro PC por Wi-Fi en la misma red y mismos datos de prueba.
   Idealmente hacer 5 intentos por operación (sin otras cargas simultáneas).
4. Repetir con ambos PC activos y modificaciones en **sesiones diferentes**.
5. Con la edición abierta, interrumpir Wi-Fi y volver a conectar. Confirmar
   que el error no aparece como éxito, que no desaparecen datos y que se
   puede reintentar una vez restablecido SQLite.
6. Abrir el DOCX en Word en otro equipo y forzar el fallo de actualización
   del resumen, comprobando preservación de fuente o respaldo.
7. Comparar medianas y valores máximos para apertura, guardar, sincronizar,
   cierre y Word. Evitar atribuir diferencias a Wi-Fi sin repetir pruebas.

## Criterios para actuar
- Si guardar es rápido y `resumen Word` es lento, investigar SMB/Office,
  no añadir más locks a SQLite.
- Si `sincronización` o `históricos` domina, medir el tamaño de la
  consulta y considerar paginación adicional.
- Si `cierre SQLite` domina, medir por separado adquisición de locks y
  ejecución SQL en una PR posterior con trazas controladas.
- Si los tiempos son similares cable/Wi-Fi, investigar carga CPU, antivirus
  y cliente Windows antes de asumir un problema de red.

## No se modifica
Ni cierres transaccionales, ni bloqueo compartido, ni generación de Word,
ni SQL, ni datos o backups. Las mediciones pueden servir para fundamentar
una futura optimización, pero **no garantizan** mejorar por sí mismas
la velocidad ni prevenir bloqueos.
