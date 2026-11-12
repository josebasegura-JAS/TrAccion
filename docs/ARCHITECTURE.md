# Arquitectura de TrAcción

> Referencia estructural revisada el 10 de noviembre de 2026 sobre `main` (`3f0f0d88`). El inventario de flujos no constituye una verificación funcional de cada módulo.
>
> Este documento describe la arquitectura técnica vigente. Las reglas de negocio pertenecen a `FUNCIONAMIENTO.md`; el motivo de las decisiones relevantes, a `DECISIONS.md`.

## 1. Principios de arquitectura

1. **SQLite compartida es la fuente de verdad de negocio.** TrAcción no admite trabajo offline ni escrituras locales pendientes.
2. **Las lecturas no deben producir escrituras de negocio.** Una carga puede actualizar caché efímera de sesión, pero no sembrar SQLite ni crear datos implícitamente.
3. **Las escrituras multiusuario se protegen con OCC** (`expectedUpdatedAt`) y, cuando el flujo lo necesita, con locks compartidos.
4. **El renderer no accede directamente al fichero SQLite.** La persistencia nativa vive en Electron y se expone mediante IPC/preload.
5. **La lógica pura debe permanecer fuera de Electron siempre que sea posible**, para que pueda probarse con Vitest sin depender del runtime de Electron.
6. **Las decisiones funcionales no se deducen de la arquitectura.** Antes de cambiar un comportamiento consultar también `FUNCIONAMIENTO.md` y `DECISIONS.md`.

## 2. Estructura real del repositorio

```text
electron/
  main.ts                         arranque Electron e IPC
  preload.cts                     API segura expuesta al renderer; compila a preload.cjs
  sqlitePersistence.ts            orquestación de SQLite
  persistence/                    piezas extraídas y testeables de persistencia

src/
  features/<modulo>/
    domain/                        tipos, validaciones y lógica pura
    store/                         Zustand, repositorios y acciones
    components/                    UI del módulo
  components/                     shell y componentes todavía compartidos/legacy
  shared/                         infraestructura reutilizable
  services/                       persistencia, sincronización, locks y servicios transversales
```

La mayor parte de los módulos funcionales ya vive en `src/features/`: Actas, Actividades Externas, Ayuda Escolar, Comité, Configuración, Coordinación, Criterios RRLL, Especiales, Licencias sin sueldo, Lotería, Paritaria, Plantilla, Presupuestos, Sorteos, Tareas, Teletrabajo, Ticket Restaurante y Vinculograma. Además existe infraestructura transversal en `src/features/task-links/`.

`src/components/` conserva principalmente el shell de la aplicación y algunos puntos de entrada/editores históricos (`AjustesPage`, `Header`, `Sidebar`, `DashboardCards`, etc.). La existencia de un wrapper histórico no justifica mover un módulo durante un cambio pequeño.

## 3. Frontera Electron ↔ renderer

El renderer trabaja contra `window.traccion`, definido por `electron/preload.cts`. Los handlers de `electron/main.ts` delegan en la capa de persistencia.

Reglas:

- no importar `better-sqlite3` desde `src/`;
- no acceder al filesystem de SQLite desde componentes React;
- no añadir IPC ad hoc si la operación encaja en un repositorio existente;
- validar en Electron cualquier operación que afecte a fichero, backup, lock o mantenimiento.

`electron/sqlitePersistence.ts` sigue siendo el coordinador principal, pero parte de su lógica ya está extraída a `electron/persistence/` (`sqliteConnection`, `schemaMigrations`, `sqliteOperationGuard`, repositorios, backups, locks, mantenimiento, identidad de BD, etc.). Para cambios nuevos se prefiere ampliar esas piezas testeables antes que engordar el coordinador.

## 4. SQLite: fuente única de verdad

La política vigente sustituyó el antiguo modelo de fallback local.

### 4.1 Arranque

`src/services/persistence.ts` hidrata desde SQLite. Los datos de negocio cargados pueden reflejarse en una **caché efímera de sesión**, pero no se conserva una copia local que pueda convertirse después en fuente alternativa.

Si SQLite está vacía, TrAcción **no la rellena automáticamente** con datos antiguos del equipo. Si SQLite no está disponible, la aplicación informa del problema y **bloquea la edición**.

### 4.2 Sin modo offline

`src/services/strictSqliteWrites.ts` centraliza el guardado estricto de los repositorios compartidos:

- no registra escrituras offline;
- no reproduce colas locales;
- purga la antigua clave de cola legacy por compatibilidad;
- un cambio solo se considera guardado cuando SQLite lo confirma;
- los conflictos OCC se propagan intactos para que el store recargue el dato vigente.

Por tanto, cualquier documentación o código que describa `localStorage` como fallback operativo de negocio está obsoleto.

### 4.3 localStorage/sessionStorage

Pueden seguir utilizándose para preferencias visuales, metadatos o caché efímera controlada. No deben utilizarse para permitir que el usuario continúe modificando datos de negocio sin SQLite.

## 5. Patrón de repositorio y OCC

Los módulos con registros independientes suelen exponer un repositorio renderer (`*SqliteRepository.ts`) y una implementación Electron apoyada en repositorios JSON/tabla específica.

Una escritura normal transporta:

```text
recordId
value
expectedUpdatedAt
```

`expectedUpdatedAt` implementa **optimistic concurrency control (OCC)** mediante comparación de fechas almacenadas. Rechaza cambios si el token temporal difiere, pero no es un número de revisión inequívoco: puede repetirse o retroceder por el reloj del cliente. Existen pruebas de caracterización de este límite en `electron/persistence/occTokenCharacterization.test.ts`. Por decisión de mantenimiento (noviembre de 2026) no se planifica una migración general de esquema sin una incidencia operativa que justifique su coste.

Reglas:

- create/update/delete deben pasar por la ruta con control de concurrencia;
- el borrado de entidades JSON suele ser soft-delete (`deletedAt`), según el repositorio;
- un conflicto OCC se muestra al usuario y obliga a reconciliar/recargar;
- un fallo de conexión no se transforma en una escritura local pendiente.

No todos los módulos usan exactamente los mismos nombres públicos. No renombrar APIs solo para homogeneizar si no existe beneficio funcional.

## 6. Locks: tres conceptos distintos

No deben confundirse:

### Lock de mantenimiento de fichero

Gestionado en Electron. Coordina operaciones como backup, VACUUM o actuaciones sobre el fichero SQLite compartido.

### Lock de registro

`useSharedRecordLock` / servicios de record lock. Evita que dos usuarios entren simultáneamente en edición del mismo registro cuando el módulo lo utiliza.

### Lock de módulo/operación

`withSharedModuleLocks` protege operaciones compuestas que deben ejecutarse como una unidad lógica. Ticket Restaurante, Sorteos y Especiales son ejemplos de uso.

Los locks complementan al OCC; no lo sustituyen.

## 7. Sincronización multiusuario

OCC evita sobrescrituras, pero no hace que otro puesto vea automáticamente el cambio.

`src/services/externalDataSync.ts` realiza el polling de cambios. Los stores sincronizables se registran en `syncableStoreRegistrations.ts`/`syncableStoreRegistry.ts`.

Para tablas con repositorio propio, `electron/persistence/directStoreUpdatedAt.ts` consulta `MAX(updated_at)` y expone el token de actualización. Es una señal ligera, no una garantía matemática de detección de todas las escrituras: una actualización cuya fecha no supere el máximo anterior puede pasar inadvertida al polling hasta otra recarga. No introducir triggers ni nuevos contadores sin necesidad demostrada; conservar controles OCC, locks y pruebas. Actualmente incluye, entre otros:

- Plantilla;
- Teletrabajo;
- Actas y tipos;
- Comité/Paritaria;
- Tareas;
- Sorteos;
- Licencias;
- Especiales;
- Criterios RRLL;
- Vinculograma;
- Configuración;
- Lotería;
- Ticket Restaurante (sus cinco tablas físicas).

**Regla para un módulo nuevo:** si crea una tabla propia que debe refrescarse entre puestos, registrar explícitamente su señal de `updated_at`; no asumir que un mirror-write genérico resolverá la detección.

## 8. Ticket Restaurante como store compuesto

Ticket Restaurante es un único dominio funcional y un único `storeId`, pero persiste varias entidades/tablas:

- calendarios;
- personas;
- ausencias;
- configuración;
- manutenciones.

La sincronización debe reaccionar al cambio de cualquiera de ellas. Sus escrituras se centralizan mediante acciones protegidas y locks del módulo.

Las reglas de cálculo, exclusiones, deuda, ajustes, pedido realizado y movimientos **no pertenecen a este documento**: están en `FUNCIONAMIENTO.md` y sus decisiones en `DECISIONS.md`.

## 9. Configuración compartida

La configuración de negocio que debe ser común a los tres usuarios se persiste en SQLite (`configuracion_state` y/o repositorios específicos según el dato).

No confundirla con preferencias puramente locales de interfaz. Antes de añadir una preferencia nueva hay que decidir expresamente si es:

- **compartida**: afecta al funcionamiento/rutas comunes y debe viajar por SQLite;
- **local**: afecta solo a la experiencia de ese puesto y no debe sincronizarse.

## 10. Importadores masivos

Patrón preferido para importaciones con impacto significativo:

1. leer y normalizar en memoria;
2. calcular altas/cambios/incidencias sin persistir;
3. mostrar preview o resumen cuando el riesgo lo justifique;
4. confirmar;
5. persistir en bloque;
6. conservar campos internos que el fichero importado no conoce.

Teletrabajo es la referencia histórica más clara del patrón preview/confirmación. Otros importadores pueden tener flujos distintos por necesidad funcional; no introducir una previsualización artificial si no aporta control real.

Una importación que falla por falta de SQLite debe fallar de forma visible; no debe quedar pendiente localmente.

## 11. Backups y mantenimiento

TrAcción dispone de varias capas de protección del fichero SQLite:

| Mecanismo | Propósito |
|---|---|
| Backup compartido | copia cercana a la BD compartida |
| Backup local rotado | recuperación desde el puesto |
| Backup diario | punto de recuperación por día |
| Backup de cierre | protección adicional al finalizar |
| Backup manual | operación explícita desde Ajustes |

La retención y rutas concretas dependen de la configuración vigente. La implementación está repartida entre `sqlitePersistence.ts` y `electron/persistence/` (`localBackupService`, `localBackups`, `backupReference`, etc.).

`VACUUM`/`ANALYZE` son operaciones de mantenimiento sobre la base activa y deben respetar los locks correspondientes. Ajustes expone las operaciones administrativas necesarias; no replicarlas en módulos funcionales ni ejecutarlas en el camino crítico de cierre de la aplicación.

## 12. Identidad y seguridad de la base

La aplicación mantiene información suficiente para identificar la SQLite activa y distinguir la base configurada de estados no válidos. Las preferencias y comprobaciones viven en piezas como:

- `databaseIdentity.ts`;
- `databasePreferences.ts`;
- `databaseStatus.ts` / `databaseStatusView.ts`;
- `databaseHealthMonitor.ts`.

La regla funcional es estricta: si la base compartida requerida no está disponible, TrAcción no debe aparentar que trabaja normalmente con una copia local.

## 13. Schema y migraciones

`CURRENT_SCHEMA_VERSION` solo debe incrementarse cuando existe una migración real correspondiente en `schemaMigrations.ts`/orquestación asociada.

Nunca subir el número para "marcar versión" de la aplicación. La versión de schema y la versión de TrAcción son conceptos independientes.

Una versión de la app no debe abrir y modificar silenciosamente una BD cuyo schema sea más nuevo de lo que conoce.

## 14. UI compartida

Componentes de referencia:

- `ActionButton` para acciones;
- `Field`, `Input`, `Select`, `Textarea`, `FieldLabel` para formularios;
- `PageHeader` para cabeceras de módulo;
- `useAppDialog()` para alertas/confirmaciones;
- componentes compartidos de tabla cuando el caso encaja.

La migración visual es progresiva. **No mantener listas estáticas de “módulos migrados/pendientes” en este documento**, porque caducan rápidamente. Para una auditoría UI hay que comprobar el código actual.

Reglas estables:

- evitar `window.alert`/`window.confirm` si existe el diálogo común;
- no crear un nuevo patrón de botón/campo para un único módulo;
- priorizar densidad adecuada para portátil de 14";
- mantener consistencia visual sin sacrificar información operativa.

## 15. Ayuda y documentación

La documentación tiene responsabilidades distintas:

- **Ayuda integrada**: cómo utiliza el usuario cada módulo.
- **`FUNCIONAMIENTO.md`**: reglas funcionales que el software debe cumplir.
- **`DECISIONS.md`**: por qué se tomaron decisiones relevantes.
- **`ARCHITECTURE.md`**: cómo se organiza técnicamente la aplicación.
- **README**: puerta de entrada al proyecto.

Un cambio funcional relevante debe revisar las cinco superficies que correspondan. No duplicar explicaciones extensas entre documentos: enlazar al documento propietario.

### 15.1. Ayuda contextual en la cabecera

- `PageHeader` registra las secciones mediante `helpSections` en `moduleHelpRegistry`; la cabecera global muestra el botón «?» solo si hay contenido registrado.
- Indicar únicamente `helpSubtitle` **no** activa la ayuda: los nuevos módulos deben proporcionar secciones operativas reales.
- Los textos de ayuda deben corresponder al flujo implementado y actualizarse con las modificaciones funcionales.

### 15.2. Actividades Externas y Excel espejo

- El módulo usa la clave compartida `traccion.v1.actividadesExternas.records` y los helpers `saveNewSharedArrayRecord`, `saveSharedArrayRecord` y `deleteSharedArrayRecord`.
- Las actualizaciones y eliminaciones verifican `expectedUpdatedAt` para impedir escrituras sobre registros modificados por otros usuarios.
- `syncActividadesExternasExcelBackup` genera el libro con ExcelJS y lo entrega al IPC existente `saveOperationalExcelBackup`, usando la ruta `rutaExportacionActividadesExternas` de Ajustes.
- La escritura del Excel es posterior al guardado SQLite. Un fallo de la copia debe comunicarse al usuario, sin fingir que la operación primaria ha fallado ni deshacer datos confirmados.
- Los borradores de Outlook se preparan con `createOutlookDraft`. Preparar el borrador y confirmar el envío son estados diferentes.

## 16. Actualización y versionado

TrAcción usa versión técnica `MAJOR.MINOR.PATCH`. `MAJOR.MINOR` identifica la rama visible de distribución y `PATCH` cada build.

Para una versión `MAJOR.MINOR.PATCH`, el flujo portable genera internamente:

```text
Traccion MAJOR.MINOR.exe
```

y publica para el actualizador:

```text
Traccion MAJOR.MINOR.piz
version.json
```

`version.json` es la fuente de verdad: contiene la versión técnica exacta, el nombre del paquete, SHA-256 y metadatos de actualización. El actualizador compara versiones numéricamente, valida que el `.piz` corresponda a la rama declarada y admite saltos directos entre ramas, incluidos cambios de `MAJOR` (por ejemplo `1.2.x → 2.0.x`).

Los workflows normal y Lite derivan los nombres desde la versión real del proyecto y validan que el EXE generado sea un binario de tamaño razonable antes de crear/publicar el paquete. No codificar una rama concreta (`1.2`, `1.3`, etc.) en workflows o lógica de actualización.

## 17. Tests y comprobaciones

El repositorio tiene cobertura unitaria amplia y tests específicos de persistencia, concurrencia, dominio y servicios. `electron/persistence/` contiene numerosas piezas extraídas precisamente para poder probarlas sin arrancar Electron.

`electron/sqlitePersistence.ts` sigue siendo un coordinador grande (~2.000 líneas en esta fotografía) y no debe crecer innecesariamente. Si una modificación contiene lógica determinista extraíble, crear/usar una pieza testeable en `electron/persistence/`.

Antes de entregar cambios de código, el objetivo es superar:

```bash
npm run typecheck
npm run lint
npm run test
```

y, cuando el cambio afecta a interacción Electron/UI crítica, los tests E2E correspondientes (`test:ui` / `test:critical` / `test:all` según alcance).

No afirmar que una comprobación ha pasado si no se ha ejecutado en un entorno con dependencias instaladas.

## 18. Checklist para nuevos desarrollos

Antes de crear o modificar un módulo:

1. consultar `FUNCIONAMIENTO.md` y `DECISIONS.md`;
2. decidir si el dato es compartido o local;
3. si es negocio compartido, persistirlo en SQLite;
4. definir OCC y, si procede, lock de registro/módulo;
5. registrar la detección multiusuario si hay tabla nueva;
6. impedir cualquier fallback de escritura offline;
7. separar lógica pura de UI/Electron;
8. añadir tests de la regla nueva o de la regresión corregida;
9. actualizar ayuda/documentación afectada;
10. ejecutar las comprobaciones disponibles antes de entregar.

## 19. Documentos históricos

Las auditorías puntuales (`*-audit.md` y documentos equivalentes) son fotografías de una fecha. Pueden explicar el origen de una decisión, pero **no sustituyen** a `FUNCIONAMIENTO.md`, `DECISIONS.md` ni a este documento para conocer el estado vigente.


## Diagnóstico conservador de reloj entre equipos (PR1, 11/11/2026)

- El lock de operación SQLite sigue usando `owner.json`, TTL de 30 segundos y heartbeat de 10 segundos. **No se altera el protocolo**, las revalidaciones automáticas ni el tiempo de recuperación normal.
- En Ajustes > Base de datos, cuando se consulta un lock existente, TrAcción avisa si su `updatedAt` está más de 5 segundos por delante del reloj local o no puede interpretarse.
- La liberación **manual** de un lock con fecha futura/inválida se rechaza también en Electron, aunque se intente invocar el IPC sin pasar por el botón de Ajustes. Se evita una intervención administrativa potencialmente peligrosa.
- **Límite importante:** comparar un timestamp de otro cliente con la hora local **no determina el desfase exacto** respecto al servidor ni detecta de forma fiable si el reloj de este equipo está adelantado. Que no aparezca aviso **no garantiza** sincronización horaria. Se debe verificar NTP/hora en los equipos y servidor corporativo por medios independientes.
- Un aviso no identifica corrupción SQLite. Antes de intentar una liberación forzada hay que comprobar que el propietario no continúa trabajando.
- Esta intervención no modifica OCC, `MAX(updated_at)`, el esquema SQLite, backups ni la política de sincronización. Sus riesgos de igualdad de tokens y reloj retrasado siguen pendientes de otra actuación específica.

**Pruebas:** `src/services/databaseLockView.test.ts` y `electron/persistence/databaseLockRecovery.clockSkew.test.ts`. Ninguna representa dos equipos conectados a SMB real.


## Seguridad HTML del renderer (PR2, 11/11/2026)

- El HTML de producción generado mediante Vite incorpora una **Content Security Policy** con `script-src 'self'`, `object-src 'none'`, restricciones de conexiones y permisos para imágenes locales/`data:`/`blob:`. Se conserva `style-src 'unsafe-inline'` para estilos dinámicos de la interfaz; no se permiten scripts inline en la versión empaquetada.
- En desarrollo no se inyecta esa política desde Vite porque el preámbulo de React Refresh necesita código inline. Esta excepción **no se aplica al ejecutable de producción**.
- Los fragmentos HTML pegados en el editor enriquecido se analizan con `DOMParser(..., 'text/html')` en un documento separado e inerte, se eliminan elementos activos y solo se conservan etiquetas de formato permitidas sin atributos. También se sanea el contenido almacenado antes de insertarlo en el editor.
- La CSP y el sanitizador son capas complementarias, no sustituyen la revisión de otros puntos de inserción HTML ni los controles IPC existentes.
- **Pruebas:** `src/components/ui/richText.test.ts`, más los jobs CI de compilación, web y Electron. Verificar manualmente pegado desde Word, estilos y generación de actas en el ejecutable.


## Publicación segura de Excel operativos (PR3, 11/11/2026)

- El IPC `operational-backup:save-excel` escribe el libro completo en un temporal único en la **misma carpeta** y publica con `rename`. No usa `copyFile` encima del destino, que podía dejar un Excel parcialmente copiado si la operación se interrumpía.
- Si falla la generación del temporal o su publicación (incluido un Excel abierto que Windows no permita reemplazar), se comunica un error y no se elimina el Excel anterior ni se borran históricos. La limpieza del temporal es best-effort.
- La poda de antiguos Excel se limita a nombres **exactamente** reconocidos y fechados de `Licencias_y_Excedencias_DD-MM-YYYY.xlsx` y `Vinculograma_DD-MM-YYYY.xlsx`. Los respaldos de nombre fijo de Coordinación, Criterios RRLL, Actividades Externas y Ticket Restaurante **no** eliminan archivos por coincidencia de prefijo.
- Si falla la poda tras una publicación correcta, el Excel nuevo permanece publicado y se conservan las copias anteriores. La limpieza no forma parte del éxito de la actualización.
- Se preservan carpetas, nombres y contratos IPC para el resto de la app. No modifica el contenido Excel, su formato, SQLite ni los protocolos de locks.
- Tests: `electron/operationalExcelPublication.test.ts` verifica sustitución, conservación ante errores, poda limitada y protección de otros nombres.


### Caracterización de riesgos del protocolo SMB (PR3, 2026-11-12)

`electron/persistence/databaseLockManager.protocolCharacterization.test.ts` incorpora escenarios de laboratorio **sin servidor SMB real**. Documenta el comportamiento actual ante una sustitución concurrente de `owner.json` durante el borrado de un lock caducado (E1), reentrada del mismo propietario sin contador de referencias (E5) y diferencia entre relojes de equipos (E2). Las pruebas de caracterización **no demuestran seguridad**: las que exhiben el comportamiento problemático deberán convertirse en pruebas de regresión con la garantía contraria antes de corregir el protocolo.

No se modifica el gestor de locks de producción, el TTL de 30 s, los heartbeats, ni el modo de diario SQLite. Antes de proponer cambios se debe comprobar dónde se permiten adquisiciones reentrantes fuera de la cola IPC, probar en dos clientes con la base compartida real y verificar desconexión/reconexión de red y cierre inesperado.


### PR4 · Recuperación conservadora de locks caducados (2026-11-12)

La limpieza automática de un `.lockdir` caducado aparta `owner.json` dentro del mismo directorio mediante `rename`, vuelve a comprobar el propietario y la fecha de heartbeat, y solo lo elimina si sigue correspondiendo al bloqueo caducado. Si otro cliente lo ha sustituido o renovado, se restaura con creación exclusiva (`wx`) sin sobrescribir metadatos nuevos. Una interrupción SMB durante el proceso puede dejar un fichero temporal `owner.json.reclaim-*` y requerir intervención manual; se prioriza conservar el bloqueo sobre suprimir una protección válida. El directorio `.lockdir` continúa siendo la exclusión entre procesos. No se cambian TTL, frecuencia de heartbeat, reentrada ni configuración SQLite.

Las pruebas E1 son ahora regresiones; las caracterizaciones de reentrada E5 y desfase de relojes E2 continúan abiertas. Ejecutar una prueba de integración con dos puestos sobre SMB real antes de considerar el protocolo plenamente validado.


### PR4B · Adquisiciones reentrantes y límites del reloj (2026-11-12)

Un registro de adquisiciones local al **proceso Electron** mantiene un contador por ruta de bloqueo y propietario. Dos llamadas con el mismo `ownerId`, PID y `createdAt` reciben identificadores de adquisición distintos y no eliminan `.lockdir` hasta liberar la última. Las liberaciones repetidas son idempotentes y no se permite liberar un bloqueo mediante un objeto arbitrario. Se verifica también `pid` y `createdAt` al liberar para reducir el riesgo de actuar sobre un propietario sustituto. Esto protege las reentradas del mismo proceso (incluyendo gestores distintos); no sustituye la serialización de escrituras de la cola SQLite.

**Desfase horario E2:** el TTL sigue dependiendo de `Date.now()` y de `updatedAt` comunicado por el otro equipo. Con relojes distintos una renovación válida puede aparentar más de 30 s. Se mantienen pruebas que documentan este límite: sin reloj común comprobado o concesión de exclusividad basada en el servidor, ampliar arbitrariamente la tolerancia no demuestra corrección. Se requiere comprobar la sincronización horaria de los puestos y observar la recuperación en SMB real antes de rediseñar el algoritmo.


### PR5A · Restricciones de navegación Electron (2026-11-12)

La ventana principal permite únicamente la navegación al mismo documento cargado por TrAcción; la parte `#hash` de la SPA puede variar. Se rechazan rutas `file:` arbitrarias, protocolos ajenos y hosts/puertos/rutas distintos del origen de Vite. Las ventanas emergentes continúan denegadas mediante `setWindowOpenHandler`. La política se encuentra aislada en `electron/navigationPolicy.ts` con pruebas unitarias. Se conservan `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` y la CSP de producción existente.

**Actualización de runtime pendiente:** la aplicación instala Electron 33.4.11 desde el lockfile. Las ramas 43/44/45 están soportadas en noviembre de 2026, pero la actualización exige regenerar `package-lock.json` desde el registro npm y ejecutar compilación/reconstrucción de `better-sqlite3`, E2E y empaquetado Windows. No editar el lockfile a mano ni elevar Electron sin las comprobaciones del ABI nativo. Esta fase de PR5 se limita conscientemente al refuerzo verificable de navegación.
