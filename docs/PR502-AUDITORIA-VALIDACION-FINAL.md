# PR502 · Validación integral, riesgos residuales y decisión de despliegue

## Decisión técnica provisional

**NO-GO para activar el escritor SQLite aislado** en TrAcción hasta que se complete y revise la evidencia especificada abajo. La aplicación de producción debe continuar usando su flujo actual, sin cambios de encaminamiento de operaciones. Una PR fusionada o una compilación Windows correcta **no equivalen** a autorizar la activación experimental.

## Evidencia automatizada y alcance

La PR #501 (commit fusionado previamente) finalizó con CI verde. Esta PR incorpora:

- `detachedWriterIntegralValidation.test.ts`: escenario combinado con base SQLite real de ensayo, journal duradero, operación con recibo, confirmación de EXIT y recuperación dentro de una barrera SMB simulada; también simula pérdida de ACK tras commit, corte de conexión y ausencia de EXIT. Comprueba que un ACK nunca es prueba definitiva de commit y que una operación incierta no se reenvía automáticamente.
- Refuerzo de `exclusiveWriterRecoveryBarrier.ts`: cuando falla la suspensión del heartbeat no se libera el lock SMB. Si existiese E/S de heartbeat todavía viva, liberar el lock podría cruzarse con ella.
- `audit-detached-writer-readiness.mjs`: informe `audit-results/detached-writer-readiness.{json,md}` publicado en el artefacto del carril **calidad**. Detecta componentes ausentes y nuevas importaciones del escritor experimental en las entradas productivas centrales. Señala explícitamente limitaciones de la búsqueda estática, requisitos de validación faltantes y `productionHandoffReady:false`.

**No se han medido tiempos, estabilidad o resistencia reales en dos máquinas Windows con SMB** en esta PR. El test SQLite con mutex/lock simulado no acredita el comportamiento de Windows frente a un corte físico de red.

## Protocolo de pruebas físicas — imprescindible antes de cualquier autorización

Preparar una **base de datos de prueba desechable**, nunca copiar datos personales de producción. Ejecutar desde dos equipos Windows independientes con acceso a la misma carpeta SMB y registrar:

| Caso | Acción controlada | Criterio de aprobación | Evidencia mínima |
|---|---|---|---|
| 1. Base común | Arrancar cliente A y B y leer/modificar registros de prueba | Identidad SQLite coincidente, cambios visibles, sin pérdida ni duplicación | hora, build, UUID anonimizado, logs de A y B |
| 2. Escrituras paralelas | Escribir sobre el mismo registro desde ambos | OCC o lock impide sobrescritura silenciosa | historial de resultado y conflictos |
| 3. Corte de cable | Desconectar A durante escritura | Sin repetición automática de un resultado incierto; bloqueo recuperable solo con evidencia | logs antes/después, journal, locks |
| 4. Cambio a Wi-Fi | Pasar A de cable a Wi-Fi, B permanece conectado | Ningún escritor concurrente sin exclusividad; integridad verificable tras recuperación | trazas de red, quick_check, tiempos |
| 5. Caída del main | Finalizar Electron main mientras un utilityProcess tiene escritura abierta | Nunca se crea otro escritor hasta demostrar EXIT del proceso anterior, no basta PID/TTL | proceso observado en SO, marcador duradero |
| 6. Caída del child | Terminar el worker antes de emitir ACK | Operación queda incierta, reconciliada solamente por recibo SQLite bajo lock | registro de operación, recibo, resultado |
| 7. Reinicio Windows | Reiniciar con marcador `launching`/journal sin resolver | NO-GO para rearmado; requiere verificación administrativa de proceso anterior | capturas/registro de estado y archivos |
| 8. Error de heartbeat | Inyectar retraso/fallo de E/S SMB durante la recuperación | No liberar lock hasta detener realmente heartbeat; no habilitar escrituras | logs de heartbeat y owner |
| 9. Backup/VACUUM | Intentar backup, lector auxiliar y VACUUM mientras se cede SQLite | Freeze/drain evita solapamiento con el writer, sin hangs permanentes | contadores activos y eventos EXIT |
| 10. Cortes repetidos | Repetir desconexión/reconexión y abrir ambos equipos | No se declara éxito sin quick_check e identidad coherentes; sin pérdidas confirmadas | mediciones P95/P99 y registros de incidentes |

Antes de cada caso anotar: versión de TrAcción, versión Windows, ubicación/ruta de prueba (sin datos personales), configuración red, modo SQLite, operativas habilitadas y pasos reproducibles. **No ejecutar pruebas destructivas sobre la carpeta productiva.** Terminado cada caso, guardar copia de evidencia anonimizada y verificar estado de journal, locks y SQLite.

## Criterios objetivos para una futura decisión GO

1. **CI de una misma revisión:** carriles calidad, Vitest, web y Electron completados correctamente, sin pruebas omitidas que afecten a la ruta experimental.
2. **Proceso huérfano:** implementado un mecanismo verificable para establecer terminación anterior tras una caída del proceso principal; no inferir por PID, timeout, expiración TTL ni `kill` solicitado.
3. **Bloqueo y recuperación SMB:** exclusividad demostrada durante toda la conciliación, heartbeat finalizado y ningún acceso independiente.
4. **Cobertura completa de escritura:** todas las rutas que se pretenda transferir usan operación recibada, journal-before-send, OCC y no-retry.
5. **Pruebas físicas:** resultados de los diez escenarios anteriores revisados, con fallos repetibles corregidos y nuevas ejecuciones aprobatorias.
6. **Activación y rollback:** aprobación explícita documentada, fallback autorizado solo donde se pruebe ausencia de escritor activo y cero operaciones inciertas.

## Hallazgos no cerrados

- **CRÍTICO — proceso huérfano tras crash de main:** no existe aún una implementación Windows real que pruebe la terminación independiente; `assertPreviousWriterTerminated` es un contrato que debe implementarse.
- **CRÍTICO — integración productiva:** el escritor experimental continúa desconectado del IPC productivo, por lo que no se ha verificado su comportamiento de extremo a extremo dentro de la aplicación completa.
- **ALTO — persistencia en Windows:** fsync/rename del marcador y journal requieren pruebas ante cierre abrupto y suspensión del equipo.
- **ALTO — Windows/SMB real:** sincronización de locks, propietarios, heartbeat y proceso hijo debe probarse físicamente, no se puede inferir de mocks.
- **MEDIO — auditoría estática:** la búsqueda de aperturas nativas y de importaciones no demuestra ausencia de rutas dinámicas o accesos indirectos.
- **MEDIO — rendimiento:** no existe aún comparación experimental P50/P95/P99 entre el escritor actual y el aislado sobre el mismo entorno de prueba. Sin evidencia no se atribuye una mejora de latencia.

## Resultado de este bloque

La PR #502 proporciona **auditoría, pruebas cruzadas, defensa adicional de SMB y procedimiento de aceptación**, no un permiso automático de activación. Si las pruebas anteriores no pueden realizarse o fallan, debe mantenerse el sistema productivo anterior y el escritor aislado en estado **NO-GO**.

Cualquier futura PR de activación debe ser independiente, explícita y justificada por evidencia de las pruebas indicadas, en lugar de activar la opción por el simple hecho de fusionar esta auditoría.
