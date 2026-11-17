# PR496 — Control de propiedad en la apertura nativa SQLite de main

## Hallazgo

`electron/persistence/sqliteConnection.ts` ofrece `openSqliteDatabase`, usada por rutas del proceso principal que pueden crear un handle SQLite nuevo. Hasta ahora dependía de que cada llamador invocase por su cuenta `sqliteEngineOwnershipFence.assertMayEnterMain()`. La omisión en un consumidor nuevo podría permitir la apertura de una segunda conexión tras iniciar el futuro handoff.

## Corrección aplicada

- `openSqliteDatabase` ejecuta **siempre** `sqliteEngineOwnershipFence.assertMayEnterMain()` antes de cargar `better-sqlite3` y crear un handle. Si main está en `draining`, `main-closed`, `worker` o `quarantine`, se rechaza la apertura.
- Se conserva el comportamiento actual cuando main continúa siendo propietario. No cambia el SQL, esquema, journaling ni tiempos de espera.
- Prueba de integración con archivo real: comenzar handoff, rechazar apertura antes de crear archivo SQLite y admitir nueva apertura sólo después de cancelar legítimamente el handoff **antes** de cerrar main.
- `classify-sqlite-routes.mjs` verifica que la guardia está antes del constructor nativo y genera `audit-results/sqlite-native-open-pending.json` con los archivos con aperturas heurísticas todavía sin clasificar.

## Limitaciones y riesgo residual

- Esta barrera protege el **punto de entrada compartido** `openSqliteDatabase`; los módulos que instancian `better-sqlite3` directamente no quedan automáticamente cubiertos.
- El inventario estático busca patrones heurísticos y no demuestra cobertura completa; el informe deja explícitamente `productionHandoffReady:false`.
- Impedir aperturas nuevas no sustituye al drenaje real de handles y E/S existentes, ni verifica locks SMB de otros equipos.
- No se activa el writer experimental. Sigue prohibido ceder en producción hasta cerrar las aperturas restantes, validar supervisor, journal y recuperación, y ejecutar ensayos físicos de dos instancias Windows/SMB.
- Un guard central de main no debe utilizarse por el worker experimental: éste tiene su propio protocolo de propiedad.

**Estado:** implementación subida; CI pendiente de confirmar.
