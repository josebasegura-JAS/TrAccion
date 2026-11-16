# PR463 — Teletrabajo: núcleo SQL compartido para guardados individuales y por lote

## Alcance
Se extrae de `teletrabajoRepository.ts` la escritura de solicitudes al módulo `persistence/teletrabajoWriteCore.ts`. Los dos puntos de entrada reutilizan la misma función:
- `saveTeletrabajoSingleTransaction`: una solicitud con control de concurrencia optimista (OCC) y actualización del token.
- `saveTeletrabajoBatchTransaction`: N solicitudes bajo **una única transacción**. Si cualquier registro falla la comprobación de versión, lanza `TeletrabajoBatchSaveError` dentro de la transacción y revierte todas las escrituras previas. Se conserva `recordId` y el resultado del conflicto.

La fachada productiva mantiene `safeDatabaseOperation`, barreras de heartbeat y estado, comprobación de escritura, bloqueo SMB, tratamiento de conflictos y programación del backup después de un commit con éxito. La migración legacy se inyecta y se ejecuta dentro de la misma transacción que el guardado.

## Pruebas de regresión SQLite nativo
- Dos solicitudes + token guardados conjuntamente.
- Conflicto OCC en tercera solicitud: reversión de las dos anteriores y del token.
- Fallo SQL en última solicitud: rollback completo.
- Fallo posterior a migración legacy: rollback de la importación inicial.
- Guardado individual OCC.
- Identificación del registro causante para el error mostrado a la UI.

## Seguridad y bloqueantes
Esta PR prepara el núcleo para el escritor auxiliar, **pero no conecta ni activa el proceso auxiliar**. La carga de Teletrabajo sigue pudiendo ejecutar una migración legacy escritora. También queda por coordinar el flag de migración en memoria con posibles rollbacks: el indicador no debe considerarse acreditación de commit.

Siguiente fase: adaptador, protocolo y runner de Teletrabajo para utilityProcess; Presupuestos; auditoría de accesos y migraciones al cargar; propietario único SQLite, lock/heartbeat SMB y recuperaciones en Windows.
