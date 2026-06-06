# Auditoría quirúrgica de persistencia y preparación SQLite

## Decisión técnica

**Migración parcial segura / infraestructura base.** La app mantiene stores Zustand síncronos que leen `localStorage` durante la carga de módulo y exponen API síncrona. En Electron, el acceso correcto a SQLite desde renderer debe pasar por `preload` + IPC, que es asíncrono. Migrar todo a lectura SQLite real en una sola intervención obligaría a rehidratar todos los stores, cambiar ciclos de carga y tocar componentes: riesgo alto de alterar lógica funcional.

Se implementa una capa central que conserva la persistencia actual en `localStorage`, crea SQLite en el proceso main, registra migraciones versionadas, guarda backup previo de la base antes de migrar, copia un snapshot completo de `localStorage` a SQLite en cada arranque y espeja las escrituras posteriores de claves conocidas desde una única capa de renderer.

## Persistencia actual por módulo y archivo

| Módulo | Archivo | Persistencia real | Datos a conservar |
| --- | --- | --- | --- |
| Plantilla | `src/features/plantilla/store/useEmployeeStore.ts` | `localStorage`: `traccion.v1.plantilla.employees`, `traccion.v1.plantilla.jobPositionTranslations`; fallback a `src/data/mockEmployees.ts` si no hay datos | Personas, borrado lógico, selección, traducciones de puesto Lanpostua |
| Tareas | `src/features/tareas/store/useTaskStore.ts` | `localStorage`: `traccion.v1.tareas.tasks`; migración legacy desde `traccion.v1.peticiones.peticiones`; flag `traccion.v1.tareas.peticionesMigrated` | Tareas, seguimientos, estados, fases, histórico y tareas legacy migradas |
| Teletrabajo | `src/features/teletrabajo/store/useTeletrabajoStore.ts` | `localStorage`: `traccion.v1.teletrabajo.solicitudes` | Solicitudes de teletrabajo importadas o creadas |
| Ticket restaurante | `src/features/ticket-restaurante/store/useTicketRestauranteStore.ts` | `localStorage`: calendarios, ausencias, personas, configuración y ledger de deuda | Calendarios, días sin ticket, ausencias, personas, importes y deuda acumulada |
| Especiales | `src/features/especiales/store/useEspecialesStore.ts` | `localStorage`: `rrll_especiales_destinatarios` | Destinatarios normalizados de emails especiales |
| Sorteos | `src/features/sorteos/store/useSorteosStore.ts` | `localStorage`: `traccion.v1.sorteos.draws`, `traccion.v1.sorteos.exclusions` | Sorteos, ganadores, participantes, exclusiones |
| Criterios RRLL | `src/features/criterios-rrll/store/useCriteriosRrllStore.ts` | `localStorage`: `traccion.v1.criterios-rrll.criterios` | Criterios, metadatos y borrado lógico |
| Vinculograma | `src/features/vinculograma/store/useVinculogramaStore.ts` | `localStorage`: `traccion.v1.vinculograma.records` | Registros de vinculograma |
| Configuración | `src/features/configuracion/store/useConfiguracionStore.ts` | `localStorage`: `traccion.v1.configuracion` | Ruta de plantilla teletrabajo y fases configurables de tareas |
| UI Sidebar | `src/components/Sidebar.tsx` | `localStorage`: `traccion.sidebar.pinned`, `traccion.sidebar.activeGroup` | Preferencias visuales no críticas |
| UI Vinculograma | `src/features/vinculograma/components/VinculogramaPage.tsx` | `localStorage`: `traccion.v1.vinculograma.showExpired` | Preferencia de visibilidad de vencidos |

## Imports, exports, JSON, backups y memoria

- Importaciones de ficheros: Plantilla (`.xlsx`, `.xls`, `.csv`, `.tsv`, `.txt`), traducciones de puesto (`.xlsx`), Teletrabajo (`.xlsx`, `.csv`, `.tsv`) y Ticket restaurante (`.xlsx`, `.csv`, `.tsv`). Los parsers leen `File.arrayBuffer()` y transforman a modelos de dominio antes de persistir vía stores.
- Exportaciones: Ticket restaurante exporta CSV con `Blob` + `URL.createObjectURL`; Teletrabajo genera DOCX y usa selector nativo si está disponible o descarga en navegador.
- JSON: los stores serializan/deserializan arrays u objetos por clave; no hay backend ni ficheros JSON de datos persistidos en disco.
- Backups: no existía backup funcional de datos de usuario antes de esta intervención; ahora SQLite guarda snapshots completos de `localStorage` en `local_storage_backups` durante el arranque y copia la base existente como `traccion.sqlite.backup-<timestamp>` antes de abrirla.
- Persistencia en memoria: cada store mantiene su estado Zustand tras `load`; si SQLite falla, la app sigue con la misma memoria + `localStorage` actual.

## Infraestructura SQLite/Electron detectada

- `package.json` ya declara `better-sqlite3` como `optionalDependencies`.
- `electron/main.ts` ya exponía `database:status`, pero devolvía `prepared` sin persistencia real.
- `electron/preload.ts` y `electron/preload.cts` ya usan `contextBridge` + `ipcRenderer`.
- No se detectó `sql.js`, adapters existentes ni acceso SQLite desde componentes.

## Compatibilidad

- Electron: SQLite vive en main process; renderer solo invoca IPC desde `preload`.
- Vite: el código renderer no importa `better-sqlite3`, por lo que el bundle web no arrastra dependencias nativas.
- Windows portable: la base se ubica bajo `app.getPath('userData')/data/traccion.sqlite`, fuera del ejecutable portable y apta para datos de usuario.
- GitHub Actions: `better-sqlite3` ya es dependencia opcional; el build TypeScript se tipa mediante declaración local y el fallback mantiene la app si SQLite no está disponible.

## Esquema SQLite mínimo propuesto e implementado

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE persisted_records (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'localStorage',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE local_storage_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
```

Este esquema cubre la persistencia actual sin rediseñar módulos: conserva cada agregado tal como ya se guarda en `localStorage`, pero centralizado en SQLite y versionado. El siguiente paso seguro sería rehidratar stores desde `persisted_records` de forma asíncrona, store por store.

## Archivos tocados y motivo

- `electron/sqlitePersistence.ts`: servicio único SQLite, migraciones, backup de base y persistencia de registros.
- `electron/better-sqlite3.d.ts`: tipado mínimo local para no añadir dependencias nuevas.
- `electron/main.ts`: inicialización SQLite e IPC centralizado.
- `electron/preload.ts` y `electron/preload.cts`: API segura renderer-main para snapshot y escrituras.
- `src/services/persistence.ts`: capa única renderer para leer/escribir `localStorage` y espejar a SQLite.
- Stores y preferencias UI con persistencia: sustitución de accesos directos a `localStorage` por la capa central, sin cambiar API pública ni lógica de negocio.
- `src/App.tsx`: arranque del backup de `localStorage` hacia SQLite.
- `src/vite-env.d.ts`: tipos de la API IPC expuesta.

## Riesgos y pendientes

- La lectura funcional sigue siendo `localStorage`; SQLite queda preparado y sincronizado como infraestructura base, no como fuente primaria.
- La sincronización renderer → SQLite es asíncrona; si la app se cierra inmediatamente tras escribir, `localStorage` conserva el dato y SQLite volverá a tomar un snapshot completo en el siguiente arranque.
- Para migración total se recomienda convertir los `load()` de stores a hidratación asíncrona desde SQLite, por módulos y con tests por cada store.
