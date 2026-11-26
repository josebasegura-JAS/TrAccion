# Rendimiento CI

Baseline PR-D #551, ejecución 45565485781 (Windows, 25/11/2026):
- Vitest: 291 archivos, 1877 pruebas correctas, 234.54 s de ejecución, job ~346 s.
- Calidad: ~164 s, typecheck ~24 s, lint ~16 s, build ~38 s.
- Web: ~115 s, 1 prueba (8.6 s).
- Electron: ~218 s, 10 pruebas (~86 s).
- Trabajos paralelos: camino crítico Vitest. Los tiempos no se suman.

## E1
- Preparación de esquema vacío en una transacción para fixtures seleccionados; cada caso conserva su propio archivo, conexiones nativas y lógica de producción bajo prueba. No alterar tests de migración, apertura, durabilidad ni estrés multiproceso.
- Evitar descargar el binario Electron en lanes que no ejecutan Electron. Mantener npm ci, scripts de instalación y ABI SQLite.
- Cache Chromium por plataforma y lockfile, mantener playwright install para comprobar disponibilidad.
- Iteración local: npm run test:focused -- electron/appUpdate.test.ts (o archivo afectado). No sustituye validación integral.
- Comparar el informe de tiempos y los cuatro jobs con baseline, mantener todas las pruebas y umbrales. El helper exclusivo de fixtures no forma parte de la cobertura de producción.

## E2, si aporta valor tras medir E1
- Comparar 3/4 workers con mismo runner; no cambiar sin evidencia.
- Revisar arranques Electron y compilaciones redundantes sin reducir escenarios.
- Mantener ABI Node/Electron separados, no compartir node_modules ni desactivar fsync de las pruebas de durabilidad.

## Resultado E1 (#552, ejecución 45566475047)
- Vitest 161.90 s (-31%), job 268 s (-22%), 291 archivos y 1877 pruebas correctas.
- Calidad 157 s, web 134 s (primera creación de caché), Electron 179 s (10 pruebas). Variación de runner; no atribuir causalidad a E1 en esos jobs.
- Caracterización SQLite 78.77 -> 7.14 s; multiusuario 66.53 -> 1.39 s; integridad 37.14 -> 1.33 s; identidad 32.38 -> 0.80 s.

## E2: ensayo controlado
- CI ejecuta la misma suite con cuatro workers, el comando local conserva tres.
- npm ci prefiere caché, conserva lockfile, scripts nativos, reintentos y salida completa; la salida se muestra al terminar cada intento para evitar Tee por línea.
- Semilla de base ficticia de producción en prueba de aislamiento preparada en una transacción; primer arranque desde cero permanece intacto.
- No cambiar workers de Electron, arranque, fsync ni stress multiproceso sin evidencia. No eliminar compilación duplicada entre jobs independientes si compromete la validación autónoma.
- Comparar contra E1 y baseline D; revertir cuatro workers si la ejecución completa empeora o aparecen fallos de recursos/concurrencia.

## E3: generación de portable

Baseline manual #45419296948: ~291 s (dependencias 68 s, compilación 27 s, empaquetado 165 s, resto 31 s); artefacto 112517621 bytes. Restaurar cachés antes de npm ci y versionado, usando lockfile original; npm ci sigue siendo obligatorio y electron-builder sigue reconstruyendo los módulos nativos. Medir cada fase y tamaño final en el resumen Actions. Opción manual `compression: store` para ensayos rápidos; `normal` sigue siendo el valor predeterminado para distribución. Comparar dos builds de igual código y caché caliente; no afirmar ahorro hasta medir. Comprobar arranque del portable, identidad de entorno, ABI y manifiesto SHA-256. No reutilizar dist de otros commits ni omitir compilación. Rama estable intacta.

## E4: caché instalada experimental v2 (26/11/2026)

Comparación de builds experimentales normales, duración del job:
- 45794759522 (antes de caché instalada): 259 s; npm ci 63 s; compilación 18 s; empaquetado 132 s.
- 45795519843 (primera caché instalada): 247 s; restauración 1 s, instalación 50 s, guardado 5 s; compilación 18 s; empaquetado 122 s.
- 45808697243 (caché recuperada pero descartada): 341 s; restauración 9 s, instalación 64 s; compilación 31 s; empaquetado 175 s. Artefacto 112536626 bytes, frente a 112533221. El log acredita cache-hit y npm ci posterior, sin ejecución de npm ls; no identifica qué ruta rígida faltaba.

V2 elimina las rutas internas rígidas como criterio de reutilización: npm ls, resolución efectiva del ejecutable Electron y consulta nativa en memoria con Node. Si falla, instalación limpia y nueva comprobación obligatoria; la caché se guarda únicamente antes de reconstrucción para Electron y con coincidencia exacta de Node/lockfile/manifest/runner. No se reutiliza dist; se mantienen ambos typechecks, rebuild nativo, compresión normal y smoke empaquetado. Se anotan tiempos de dependencias, compilación, empaquetado y tamaño en el resumen. El primer build v2 calentará la caché; comparar al menos dos builds posteriores del mismo commit. No se atribuye la variación de compresión a una causa comprobada ni se garantiza ahorro hasta medir. Distribución main sin cambios.
