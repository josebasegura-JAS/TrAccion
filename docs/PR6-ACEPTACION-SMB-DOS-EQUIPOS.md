# PR6C · Aceptación multiusuario real: TrAcción, SQLite y SMB

Objetivo: comprobar en dos equipos Windows que las regresiones automatizadas PR6A y PR6B reflejan el uso real. Esta guía define pruebas pendientes, no certifica que se hayan ejecutado.

## Protección previa

- Trabajar exclusivamente sobre una copia de prueba independiente, con datos ficticios y backup restaurable. Nunca provocar desconexiones sobre una base de producción.
- Ambos clientes deben apuntar al mismo archivo de prueba; registrar versiones de TrAcción, Electron, Windows, enlace (cable/Wi-Fi) y hora de ambos equipos.
- Verificar que los relojes están sincronizados; el TTL del bloqueo depende de la hora y el riesgo E2 continúa abierto.
- No borrar bloqueos manualmente ni forzar liberaciones cuando un propietario siga trabajando. No publicar rutas de red, credenciales ni registros personales.

## Escenarios y criterios esperados

| Caso | Operación de prueba | Aceptación |
| --- | --- | --- |
| R1 | Dos puestos consultan y guardan Tareas, Comité y Paritaria sobre registros distintos | Persisten todos los cambios, sin errores ni duplicados |
| R2 | A edita una tarea; B intenta editar la misma | B detecta la reserva y no sobrescribe a A |
| R3 | A mantiene una edición; B guarda otro registro | B puede guardar sin bloqueo indefinido |
| R4 | Interrumpir acceso SMB durante guardado de A | El resultado incierto no se anuncia como éxito ni se reintenta sin confirmación |
| R5 | Cambiar cable por Wi-Fi con SQLite todavía accesible | No se bloquea innecesariamente la edición tras verificación correcta |
| R6 | Desconectar SMB completamente y recuperar la conexión | Ante fallo confirmado se bloquea edición; se reactiva solo tras comprobar SQLite y sincronizar |
| R7 | A y B guardan distintos registros casi simultáneamente | Exclusión entre procesos y consistencia al recargar |
| R8 | Coincidir con backup programado usando datos ficticios | Copia restaurable, integrity_check = ok, sin bloqueos persistentes |
| R9 | Cerrar abruptamente un cliente de pruebas durante un lock | No se borra lock vigente de otro cliente; recuperación segura tras caducidad real |
| R10 | Repetir R1/R5/R6 y revisar informes tras 3000 muestras | Se informa de truncamiento; N=0 o P95 bajo con N pequeño no se considera prueba de estabilidad |

## Plantilla privada por escenario

Registrar: ID; fecha/hora; versiones; PC A/B (alias); red inicial/final; pasos realizados; esperado; observado; resultado PASA/FALLA/NO EJECUTADO; incidencias; estado final de SQLite; N, fallos, P50, P95 y máximo por categoría y operación; evidencia anonimizada.

## Criterios de rechazo de despliegue

- Corrupción o integrity_check distinto de ok, pérdida de un guardado confirmado, escritura simultánea incorrecta, liberación de un bloqueo vivo ajeno o duplicación automática de una escritura incierta.
- Recuperación que reactiva edición antes de sincronizar, ausencia de reconexión, fallo del ejecutable Windows o imposibilidad de iniciar SQLite.
- Toda incidencia bloqueante exige corrección con prueba de regresión y repetir los escenarios afectados antes de desplegar.

## Evaluación de rendimiento

Comparar dos informes con cargas, número de usuarios, equipos y conexiones similares. Evaluar ipc-wait, ipc-run, smb-lock-wait, smb-lock-held, record-lock y backup por separado. Exigir al menos 20 muestras por grupo como mínimo descriptivo; no es garantía estadística. No deducir causalidad por un P95 menor, ni ausencia de problemas por N=0. El tope de 3000 muestras descarta histórico antiguo.

## Puesta en marcha gradual

1. Fusionar PR6A/PR6B únicamente con CI verde; comprobar EXE y addons nativos.
2. Ejecutar R1–R10 en la base de prueba y conservar resultados sin datos personales.
3. No desplegar mientras quede un caso bloqueante FALLA o NO EJECUTADO.
4. Autorizar despliegue gradual únicamente tras validación, copia de respaldo y plan de reversión comprobado.

**Estado inicial:** R1–R10 NO EJECUTADO. Una CI verde no prueba transiciones físicas de red ni fiabilidad real de SMB.
