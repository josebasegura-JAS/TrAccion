# Arquitectura de TrAcción

> Estado contrastado con el repositorio de TrAcción 1.2.111 (septiembre de 2026).
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
  preload.ts                      API segura expuesta al renderer
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

La mayor parte de los módulos funcionales ya vive en `src/features/`: Actas, Ayuda Escolar, Comité, Configuración, Coordinación, Criterios RRLL, Especiales, Huelgas, Licencias, Lotería, Paritaria, Plantilla, Presupuestos, Sorteos, Tareas, Teletrabajo, Ticket Restaurante y Vinculograma.

`src/components/` conserva principalmente el shell de la aplicación y algunos puntos de entrada/editores históricos (`AjustesPage`, `Header`, `Sidebar`, `DashboardCards`, etc.). La existencia de un wrapper histórico no justifica mover un módulo durante un cambio pequeño.

## 3. Frontera Electron ↔ renderer

El renderer trabaja contra `window.traccion`, definido por `electron/preload.ts`. Los handlers de `electron/main.ts` delegan en la capa de persistencia.

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

`src/services/pendingRecordWrites.ts` mantiene compatibilidad de API con repositorios antiguos, pero actualmente:

- no registra escrituras offline;
- no reproduce colas locales;
- purga colas legacy;
- un cambio solo se considera guardado cuando SQLite lo confirma.

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

`expectedUpdatedAt` implementa **optimistic concurrency control (OCC)**. Si el registro cambió desde que el usuario lo cargó, SQLite rechaza la escritura en vez de pisar el cambio de otra persona.

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

Para tablas con repositorio propio, `electron/persistence/directStoreUpdatedAt.ts` consulta `MAX(updated_at)` y expone el token de actualización. Actualmente incluye, entre otros:

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

`VACUUM`/`ANALYZE` son operaciones de mantenimiento sobre la base activa y deben respetar los locks correspondientes. Ajustes expone las operaciones administrativas necesarias; no replicarlas en módulos funcionales.

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

## 16. Actualización y versionado

La versión visible del producto es **TrAcción 1.2**. La versión técnica mantiene el tercer componente (`1.2.xxx`) para builds y actualización.

El flujo portable vigente genera internamente el ejecutable estable `Traccion 1.2.exe`. Para distribución del actualizador se publica:

```text
Traccion 1.2.piz
version.json
```

`version.json` conserva la versión técnica y la referencia/hash del paquete. El `.piz` contiene el binario que el actualizador instala/reemplaza.

Los workflows normal y Lite validan que el EXE generado sea un binario de tamaño razonable antes de crear/publicar el paquete de actualización. No reintroducir nombres variables del EXE por cada build salvo cambio deliberado del sistema de actualización.

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
