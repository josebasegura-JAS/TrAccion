# PR 1 — Auditoría y reglas de notificaciones

**Referencia:** rama `main`, revisión de código de 2026-11-06. **Alcance de esta PR:** inventario, taxonomía y contrato de comportamiento. No cambia la experiencia de usuario ni el guardado.

## Cómo reproducir el inventario completo

Desde la raíz del repositorio:

```bash
node scripts/audit-notifications.mjs
```

Produce `audit-results/notifications-inventory.json` y `audit-results/notifications-inventory.md`. Examina archivos de producción `.ts/.tsx/.js/.jsx` bajo `src/` y `electron/`; excluye pruebas y compilados. El informe tiene archivo, línea, categoría y fragmento para revisar. Es un **detector de candidatos**, no una prueba de que cada coincidencia se muestre al usuario. Deben revisarse expresamente JSX, mensajes multilinea, textos dinámicos, utilidades indirectas y notificaciones creadas en otras rutas. Para las PR siguientes, completar la columna de revisión y confirmar todos los flujos en ejecución.

## Sistemas comprobados (evidencia directa)

| Sistema | Código | Comportamiento observado | Riesgo / criterio |
|---|---|---|---|
| Toast global | `src/components/ui/Toast.tsx` y `toastContext.ts` | success 3 s, info 4,5 s, warning 6 s, error 8 s; máximo cuatro; deduplicación por tono+título+texto | Aprovecharlo como aviso efímero; no usarlo como único aviso de pérdida de datos |
| Modal | `src/hooks/useAppDialog.ts`, `src/components/ui/AppDialog.tsx` | alert/confirm, niveles info/warning/error, confirmación peligrosa | Reservar para decisiones y bloqueos que requieren respuesta |
| Indicador global | `src/components/GlobalBusyIndicator.tsx` | saving, saved, error; lento a los 3 s; salvaguarda visual a los 30 s; saved 1,6 s; error 7 s | La expiración visual de 30 s NO equivale a finalización de la operación |
| Guardado inline | `src/components/InlineSaveFeedback.tsx` | sólo «saved»; 1,8 s; evita duplicación con indicador global si está montado | Confirmar sólo operaciones realmente comprometidas |
| Eventos de persistencia | `src/services/persistenceFeedback.ts` | saving/saved/error; visibility visible/silent; operation read/write | No romper distinción lectura/escritura y silencio de sincronización |
| Error de guardado | `src/App.tsx` (`PersistenceErrorBanner`) | Banner persistente para errores; acceso a Ajustes en problemas de bloqueo | Posible simultaneidad con indicador global: deduplicar presentación, no suprimir la incidencia |
| Conexión compartida | `src/App.tsx` y `src/components/ConnectionRecoverySplash.tsx` | Bloqueo de edición ante falta de base compartida y recuperación | Es protección de integridad; conservar bloqueo y diagnóstico |
| Respaldo Excel | `src/components/ExcelBackupRetryBanner.tsx` | Fallos de copia auxiliar persistentes y reintento; distingue SQLite guardado de Excel fallido | No declarar datos no guardados cuando sólo falla el respaldo |
| Error de render | `src/App.tsx` | Error boundaries para módulo y shell, con acción de reinicio | Mantener vía de recuperación, log técnico separado |
| Actualizaciones | `src/components/AppUpdateChecker.tsx` | Confirmación de actualización y alert en error | Mantener decisión explícita de la persona usuaria |
| Ticket Restaurante | `src/features/ticket-restaurante/components/TicketRestaurantePage.tsx` | Coexisten `toast.success/error/warning` y `alert/confirm` | Revisar uso según gravedad y acción; no convertir confirmaciones a toast |
| Lotería | `src/features/loteria/components/LoteriaPage.tsx` | `setMessage` y `role="alert"`; aviso de Excel pendiente con SQLite guardado | Mantener estado de respaldo diferenciable |
| Tareas | `src/components/TareasPage.tsx`, `src/components/TaskEditor.tsx` | Diálogos en exportación y `saveStatusIsError` en editor | Revisión de duplicidad con errores globales |

La tabla es un **inventario verificado de mecanismos relevantes**, no una afirmación de cobertura del 100 % de textos del producto. El inventario completo de candidatos se genera con el script al ejecutarlo sobre el repositorio.

## Taxonomía obligatoria para la futura PR 2

| Severidad / estado | Cuándo procede | UI por defecto | Caducidad |
|---|---|---|---|
| `success` | Acción confirmada; SQLite confirmó escritura, o exportación terminada | Toast o estado inline, una sola vez | Breve |
| `info` | Hecho informativo no bloqueante | Toast | Breve |
| `warning` | Validación o riesgo corregible, sin demostrar pérdida de datos | Próximo al campo o toast; banner si persiste | Según vigencia |
| `error` | Acción fallida; archivo no generado; escritura no confirmada | Inline/banner si requiere intervención; toast para fallos puntuales | Nunca desaparecer como única evidencia si persiste |
| `pending` | Operación iniciada sin confirmación de fin | Indicador de proceso | Hasta desenlace comprobado o estado desconocido explícito |
| `confirmation` | Acción destructiva, pérdida de borrador o decisión relevante | Modal | Hasta respuesta |
| `blocking` | Base compartida inaccesible, render irrecuperable o prohibición de editar | Banner/pantalla de bloqueo con recuperación | Hasta condición real de recuperación |

**Reglas transversales:**

1. Un suceso debe tener **un aviso primario**, con los estados permanentes necesarios en casos críticos. No repetir literalmente error de persistencia en toast + indicador + banner.
2. Nunca mostrar «Guardado» por iniciar una operación, por una respuesta no confirmada, por temporizador ni por un respaldo Excel auxiliar. Confirmación tras resultado real.
3. Diferenciar: **datos SQLite guardados**, **respaldo Excel pendiente**, **conflicto de versión multiusuario**, **lectura fallida**, **guardado fallido** y **conexión ausente**.
4. Guardado lento y resultado desconocido no equivalen a error confirmado ni a éxito. Si la operación supera el tiempo del indicador, mantener un estado visible que no induzca a cerrar la ventana.
5. Evitar textos técnicos sin contexto en UI; conservar detalles diagnósticos en registro técnico. Redacción de cara a usuario: **qué pasó + repercusión + qué hacer**.
6. Para validación, priorizar mensaje junto al campo y mantener los datos; para borrado, confirmación explícita; para fallos persistentes, reintento/corrección disponible.
7. Solo un componente del flujo emite el estado final de éxito; otros escuchan o reflejan ese estado sin duplicar.
8. Accesibilidad: error urgente con `role="alert"`; estados informativos mediante `role="status"`; enfoque y teclado correctos en modales.
9. Nunca traducir automáticamente errores recuperables de bloqueo temporal SMB/SQLite en pérdida definitiva de datos.
10. Los mensajes operativos de fondo/sincronización deben poder ser silenciosos, **salvo** cuando exijan intervención o bloqueen la edición.

## Matriz de comprobación para PR 2–4

| Caso | Resultado esperado |
|---|---|
| Guardado normal | Una confirmación breve al completarse |
| Dos guardados cercanos | No confundir resultados ni silenciar error de uno por éxito del otro |
| Guardado > 3 s | Señal de demora sin confirmar éxito |
| Operación > 30 s | Resultado aún pendiente/desconocido, no fingir finalización |
| Concurrencia, versión desactualizada | Conflicto explícito, sin sobrescribir |
| Desconexión cable/Wi-Fi durante escritura | Edición protegida, estado fiable tras recuperación |
| Error al leer | Indicar fallo de actualización, sin declarar pérdida de escritura |
| SQLite correcto + Excel auxiliar fallido | Confirmar SQLite, respaldos pendientes con reintento |
| Confirmar eliminación o abandono de cambios | Modal con cancelar, acción reconocible y sin cambios si cancela |
| Error de render | Recuperación visible y diagnóstico disponible |
| Sincronización silenciosa | Sin notificaciones innecesarias, pero sin esconder fallos críticos |

## Decisiones diferidas

Esta PR **no** modifica `ToastProvider`, los componentes de guardado, la lógica de persistencia, los banners ni los diálogos. En PR 2 se definirán componentes visuales comunes; en PR 3 se tratarán los estados críticos de persistencia; en PR 4 se migrarán y probarán los módulos. Antes de cada sustitución se validará el inventario de candidatos correspondiente.
