# Decisiones de diseño y refactor

Registro de decisiones puntuales tomadas durante sesiones de refactor con
asistencia de IA, con su justificación. A diferencia de `ARCHITECTURE.md`
(reglas generales que debe seguir todo el código), este documento recoge
**casos concretos** donde se decidió no hacer algo, aplazarlo, o hacerlo de
una forma distinta a la obvia — para que una futura sesión no reabra el
mismo debate sin contexto.

## División de archivos grandes (julio 2026)

### `TicketRestaurantePanels.tsx` (2050 líneas) → 6 archivos
Se dividió por subdominio, no por tamaño: `TicketRestauranteCalendarPanels.tsx`,
`TicketRestaurantePeoplePanel.tsx`, `TicketRestauranteConfigModals.tsx`,
`TicketRestauranteCalculationPanel.tsx`, `TicketRestauranteAbsencesTable.tsx`
y un `ticketRestauranteFormat.ts` mínimo para `formatCurrency` (compartido
por 2 grupos, no merecía archivo propio pero tampoco duplicarse).

**Bonus encontrado, no buscado**: `TicketAbsenceDisplayRow` estaba definido
dos veces de forma idéntica (en el panels y en `TicketRestaurantePage.tsx`,
sin importarse entre sí). Se dejó una sola definición, exportada desde
`TicketRestauranteAbsencesTable.tsx`.

### `ActasPage.tsx` (1446 → 929 líneas)
Se extrajeron los 3 modales (`ActasOutlookTemplateModal`,
`ActaTypeManagerModal`, `ActaEditorModal`) como componentes que reciben
todo por props; el estado y los handlers de negocio se quedaron en
`ActasPage.tsx`. **No** se tocó `actasPage.helpers.tsx` (ver más abajo, era
una decisión de una sesión anterior que sigue vigente).

Al tipar explícitamente las props de `ActaEditorModal`, TypeScript señaló
que el objeto de respaldo para un tipo de acta deshabilitado/eliminado no
incluía `deletedAt` (campo requerido por `ActaTypeDefinition`). Se corrigió
como parte del mismo cambio — es el mismo patrón de "el refactor destapa un
bug preexistente" ya visto en `sqlitePersistence.ts`.

### `SessionManagementPage.tsx` (1599 → 847 líneas)
Es el componente genérico compartido por Comité y Paritaria (vía `config`
de tipo `SessionModuleConfig`). Se dividió en 5 piezas: helpers puros
(`sessionManagementPage.helpers.ts`, cero riesgo, sin JSX), las tarjetas ya
independientes (`SessionManagementPageCards.tsx`) y 3 modales
(`SessionImportPreviewModal`, `SessionEditModal`, `SessionCloseModal`). Se
tuvo especial cuidado en no tocar ningún handler de negocio: solo se movió
JSX y funciones puras.

### `TeletrabajoPage.tsx` (1389 líneas) — solo parcialmente dividido
Se migraron sus 3 modales inline restantes a `ModalShell` (ganan cierre con
`Escape` gratis y `aria-labelledby` real), pero el archivo **no** se
dividió en piezas separadas como sí se hizo con los tres anteriores. Sigue
siendo el archivo de componentes más grande del proyecto después de
`TicketRestaurantePage.tsx`. Candidato pendiente si se retoma la limpieza
de archivos grandes.

### `TicketRestaurantePage.tsx` volvió a crecer (1887 líneas)
Tras dividir `TicketRestaurantePanels.tsx`, se añadió el hardening
multiusuario (`withSharedModuleLocks` envolviendo cada handler de
escritura) directamente en `TicketRestaurantePage.tsx`, lo que la hizo
crecer de nuevo hasta ser el archivo de UI más grande del proyecto.
Pendiente: extraer esos wrappers a un hook/módulo de store
(`ticketImportActions.ts`, `ticketCalculationActions.ts` o similar) para
que no vuelvan a acumularse ahí.

## Multiusuario en Ticket Restaurante (julio 2026)

Antes de tocar nada se comprobó el store (`useTicketRestauranteStore.ts`):
la protección OCC por registro (`expectedUpdatedAt` comparado contra
SQLite) **ya existía** para calendarios, personas, ausencias y
configuración. Lo que faltaba de verdad era `withSharedModuleLocks` a
nivel de UI (el mismo patrón que ya usan Sorteos y Especiales), que se
añadió envolviendo todas las escrituras de `TicketRestaurantePage.tsx`.

De paso se corrigió un fallo silencioso real: `onToggleActive` y
`onToggleDay` estaban conectados directamente a las funciones del store
sin comprobar `result.ok` ni mostrar error. Si otro usuario ya había
modificado ese registro, el fallo no se veía por ningún sitio.

**Manutenciones quedaron fuera de la primera pasada** porque, a diferencia
de las otras 4 entidades, `saveManutenciones`/`removeManutencion` eran
funciones síncronas de tipo `void` ("fire-and-forget"), sin `expectedUpdatedAt`
en absoluto. Se decidió arreglarlo como tarea aparte en vez de forzarlo
dentro del mismo cambio, para no mezclar dos cambios de riesgo distinto en
una misma entrega. Se completó poco después: ambas son ahora `async` y
devuelven `{ok, message?}` real.

**Nomenclatura no unificada a propósito**: las funciones de Ticket
Restaurante no llevan el sufijo `WithConcurrencyCheck` que sí usan
Especiales/Sorteos/Actas, aunque hacen la misma comprobación. Renombrar
tocaría toda la superficie pública del store y de sus ~15 puntos de
llamada sin aportar nada funcional — se documenta la inconsistencia en
`ARCHITECTURE.md` en vez de "corregirla".

## Diagnóstico de integridad de datos (julio 2026)

Se implementó reutilizando módulos ya existentes en vez de crear
infraestructura nueva: `computeHeaviestTables` (de `maintenanceQueries.ts`,
ya usado por el vacuum), `CURRENT_SCHEMA_VERSION` (de `schemaMigrations.ts`)
y `listLocalBackups` (de `localBackupService.ts`).

Las comprobaciones de "referencias cruzadas" (personas de Ticket
Restaurante con calendario inexistente, ausencias sin alta activa) se
limitaron a 2 casos conocidos y bien entendidos, no a una cobertura
exhaustiva de todas las relaciones del sistema — las tablas de TrAccion
guardan documentos JSON (`value_json`), no hay FOREIGN KEY real, así que
cada comprobación nueva exige parsear y cruzar blobs a mano. El diseño
(`findOrphanRecords` genérico) permite añadir más casos sin tocar el resto
del módulo, pero se decidió no intentar cubrir todos los módulos de
entrada.

Es de solo lectura por diseño: nunca corrige automáticamente. Detecta,
informa, y permite exportar el informe en JSON.

## CI y control de versiones (julio 2026)

Se detectó que el paso "Reparar package-lock con registry público",
presente en los 5 workflows, llevaba tiempo sin hacer nada: el
`package-lock.json` ya no tiene ninguna referencia al registro interno
(0 coincidencias comprobadas antes de tocar nada). Se eliminó de los 5
workflows en vez de dejarlo "por si acaso", porque un paso que no hace
nada pero parece hacer algo es peor que no tenerlo — genera falsa
confianza sobre qué protege realmente el pipeline.

Se añadió `.nvmrc` y se cambiaron los 5 workflows para leer la versión de
Node desde ahí (antes: `22.13.1` repetido a mano en cada archivo).

Se añadió `npm run typecheck` y se incorporó a `test:all`, pero **no** se
tocó la verificación de tipos ya existente en `tests-completos.yml`
(`node node_modules/typescript/bin/tsc` en vez de `npm run`): ese workflow
ya evita `npm run` a propósito por un problema de bin-links en Windows
documentado en otro workflow (`tests-ci.yml`), y cambiarlo habría
reintroducido ese riesgo sin necesidad.

## Decisiones heredadas de sesiones anteriores (referencia)

Estas ya estaban documentadas en el historial de sesiones antes de este
archivo; se listan aquí para que quede todo en un solo sitio:

- `actasPage.helpers.tsx` se dejó sin tocar en el refactor de `ActasPage.tsx`
  porque contiene cuatro estados de flujo semánticamente distintos que no
  se prestan a una extracción mecánica sin perder claridad.
- El badge de aviso en `TeletrabajoEditorHeader` se dejó igual: es un
  estilo de urgencia intencional, no un descuido de UI pendiente de
  homogeneizar.
- Ticket Restaurante no se usará hasta septiembre de 2026 (información del
  usuario, no verificable desde el código) — motivo original por el que su
  hardening multiusuario se dejó para el final; se completó de todos modos
  antes de esa fecha porque no había motivo técnico para esperar.
