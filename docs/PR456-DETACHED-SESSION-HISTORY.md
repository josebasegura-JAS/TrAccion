# PR456 — Histórico Comité/Paritaria en utilityProcess (SIN activar en producción)

## Alcance
- `detachedSessionHistoryImportCore.ts`: adapta `importSessionHistoryTransaction` de PR455 (la lógica SQL es compartida, no duplicada). Valida `ownerId`, módulo exclusivo `comite|paritaria`, estructuras, ids/claves externas, límite 1000 tareas/sesiones y claves de tarea únicas.
- Protocolo `detached:import-session-history` → `detached:session-history-imported`, con validación de respuesta y contadores enteros no negativos.
- Worker ejecuta la transacción completa dentro de la misma cola FIFO usada por el cierre y otros guardados; no cierra el handle con un guardado aún activo.
- Runner `ready → open → import → close → exit(0)` confirma solo con salida real, conserva resultado incierto en fallos y nunca reintenta automáticamente.
- Bridge disponible **solo** como función futura; no se invoca desde `electron/main.ts` ni IPC de producción.
- Tests nativos con SQLite: éxito, idempotencia, duplicados de lote, referencia sin resolver, error SQL/rollback, protocolo y salida del child.

## Seguridad
El helper SQL no adquiere locks. El worker **NO** adquiere ni renueva el lock SMB; debe hacerlo el coordinador en PR de propiedad única antes de abrir el child. Tampoco agenda backups: corresponde a la coordinación posterior a salida confirmada y conciliación. No sustituye la importación productiva existente en main.

## Siguientes pasos
1. PR siguiente: operaciones atómicas de Coordinación (cierre y creación de tareas), sin segmentar sus transacciones.
2. Completar cobertura de repositorios restantes.
3. Handoff exclusivo de propietario SQLite, SMB, heartbeat, recuperación y backups.
4. Ensayos Windows 2–3 usuarios, cortes SMB, resultados inciertos y métricas antes de activar por flag.
