# Revisión de ayudas integradas — plan para una PR independiente

> Inventario inicial del 10 de noviembre de 2026. **No es una certificación del contenido de cada ayuda.** Contrastar siempre el texto con los componentes actuales y, cuando corresponda, con pruebas de interfaz.

## Objetivo y alcance

Actualizar las ayudas que el usuario abre desde el botón contextual «?» de TrAcción para que describan **la pantalla y las reglas actuales**, sin introducir cambios funcionales ni tocar SQLite, SMB, transacciones, bloqueos o cálculos.

La ayuda integrada se registra a través de `src/services/moduleHelpRegistry.ts`, se representa mediante `src/components/ModuleHelp.tsx` y puede definirse en los componentes de los módulos o en archivos de secciones dedicados, como:

- `src/features/comite/components/comiteHelpSections.ts`
- `src/features/teletrabajo/components/teletrabajoHelpSections.ts`

No asumir que los módulos sin fichero `*HelpSections.ts` carecen de ayuda: consultar sus `PageHeader` y `helpSections`.

## Orden de revisión propuesto

| Prioridad | Módulo o bloque | Comprobar contra la interfaz actual |
| --- | --- | --- |
| 1 | Tareas | tabla y filtros, edición, seguimiento, tareas vinculadas, bloqueos, guardado incierto, creación de criterios RRLL |
| 1 | Comité y Paritaria | creación/edición de sesiones, puntos y tareas, importaciones históricas, cierre, actas, alegaciones y permisos |
| 1 | Ticket Restaurante | personas manuales, ausencias ENF/ACC, importación y vista previa, manutenciones PDF/Excel, pedido mensual, cotización, ajustes, exclusiones, deuda |
| 2 | Teletrabajo | calendario, importación de solicitudes, puestos, cobertura y criterios de concesión |
| 2 | Actas y Criterios RRLL | creación, vinculación, importaciones, exportaciones y estados actuales |
| 2 | Lotería y Sorteos | seguimiento de décimos, arqueos, campaña, operaciones de sorteo |
| 3 | Otros módulos | verificar que los botones «?» existentes cubren las acciones vigentes y no describen botones eliminados |

Las prioridades son de **revisión**, no afirmaciones de que una ayuda concreta esté equivocada. El alcance definitivo debe salir de la comparación con el código.

## Método de la futura PR

1. Localizar todas las referencias a `helpSections`, `ModuleHelp` y al registro de ayuda; inventariar ruta, módulo y secciones.
2. Para cada ayuda, enumerar las acciones realmente disponibles, requisitos, casos sin conexión, guardado y resultados. Contrastar con `docs/FUNCIONAMIENTO.md` y pruebas; si hay conflicto, verificar implementación antes de reescribir.
3. Corregir **solo** texto, estructura y etiquetas de ayuda. No inventar botones, reglas, permisos, rutas o resultados.
4. Explicar las operaciones sensibles (p. ej., bloqueo de edición, guardados con resultado incierto y estado de los pedidos) con mensajes breves y verificables.
5. Revisar accesibilidad, ortografía y formato de secciones; evitar instrucciones desactualizadas o duplicadas.
6. Ejecutar la validación de PR y los smoke tests de apertura de ayuda en Electron; revisar manualmente las vistas modificadas.
7. Entregar matriz `módulo → ayuda anterior → desajuste verificado → texto corregido → prueba`.

## Fuera de alcance

- Cambiar las reglas de cálculo o comportamiento funcional para adaptarlas a una ayuda incorrecta.
- Reestructurar todo el registro de ayudas o introducir una segunda infraestructura.
- Borrar ayudas de módulos que no se hayan inspeccionado.
- Incorporar migraciones o cambios de rendimiento ajenos al objetivo.

## Revisión ejecutada en noviembre de 2026

La revisión contrastó los textos de ayuda con los componentes actuales de las pantallas. Cambios incluidos en la PR correspondiente:

| Módulo | Archivo con ayuda | Ajuste contrastado |
| --- | --- | --- |
| Tareas | `src/components/TareasPage.tsx` | Filtros por responsable, búsqueda, bloqueo compartido y comprobación de guardado incierto |
| Comité / Paritaria | `src/features/comite/components/comiteHelpSections.ts` | Histórico cargado bajo demanda, importación Word y cierre con control de versiones y aviso de fallo de Word |
| Ticket Restaurante | `src/features/ticket-restaurante/components/ticketRestaurantePageConfig.ts` | Importación Excel/PDF con revisión, personas manuales separadas, tabla ordenable y prioridad de cotización |
| Lotería | `src/features/loteria/components/loteriaPage.utils.ts` | Arqueos, caja física frente a Bizum/transferencias, filtros de cero décimos y cierre con advertencias |
| Actas | `src/features/actas/components/actasPage.helpers.tsx` | Borrador Outlook, alegaciones y calendario recordatorio sin confundir creación de borrador con envío |
| Criterios RRLL | `src/features/criterios-rrll/components/CriteriosRrllPage.tsx` | Apertura desde Tareas, borradores y edición compartida |

Se inspeccionó además la presencia de ayuda contextual en Teletrabajo, Actividades Externas, Ayuda Escolar, Coordinación, Especiales, Licencias sin sueldo, Presupuestos, Sorteos, Vinculograma y Plantilla. No se cambian secciones sin confirmar un desajuste concreto; la ausencia de modificaciones no certifica exhaustivamente su contenido.

**Alcance de esta entrega:** solo textos de ayuda y este inventario. No se cambian cálculos, reglas, persistencia ni presentación de componentes compartidos.
