TrAcción 1.2.159 — incremental reconexión de red

Copiar estos archivos respetando exactamente sus rutas desde la raíz del proyecto:
- src/App.tsx
- src/components/Header.tsx
- src/services/databaseHealthMonitor.ts
- src/services/databaseConnectivityState.ts (NUEVO)
- src/services/persistenceFeedback.ts

Cambios:
- Primer fallo de conectividad bloquea temporalmente la edición.
- Monitor saludable cada 8 s; reconexión cada 2 s inicialmente y 5 s después.
- Reacción a eventos online/offline del renderer.
- Estado visual: Reconectando -> Sincronizando -> Reconectado.
- Botón "Reintentar ahora".
- Refresco completo de datos compartidos antes de reactivar la edición.
- El banner genérico de SQLite se suprime durante una recuperación transitoria para evitar avisos duplicados.
- Las incidencias de heartbeat usan el mismo estado visual de conectividad.

Nota técnica:
La cola/timeout no puede cancelar una llamada síncrona de better-sqlite3 que Windows/SMB ya haya bloqueado. Resolver ese caso al 100% exigiría aislar SQLite en un worker/proceso dedicado. No se ha realizado ese refactor en este incremental.
