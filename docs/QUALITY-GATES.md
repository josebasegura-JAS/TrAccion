# Control de calidad de TrAcción

## Baseline verificado

GitHub Actions, PR #546, ejecución 45414333547: 290 archivos de pruebas, 1852 tests superados, sin fallos. Validaciones de calidad, Vitest, web y Electron correctas. El ejecutable portable no se generó en esa ejecución.

Los umbrales de `vitest.config.ts` son mínimos de regresión, no objetivos finales. Se establecen a partir de la cobertura V8 medida en Windows, con margen para pequeñas variaciones. Los grupos se evalúan conjuntamente; el umbral de un grupo no exige el mismo porcentaje a cada archivo.

| Área | Líneas medidas | Mínimo líneas | Ramas medidas | Mínimo ramas | Funciones medidas | Mínimo funciones |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Global | 50.60 | 50 | 74.88 | 74 | 54.07 | 53 |
| Persistencia | 76.52 | 75 | 83.49 | 82 | 85.92 | 84 |
| IPC | 78.20 | 77 | 91.69 | 90 | 80.95 | 79 |
| Electron main | 75.22 | 74 | 75.34 | 74 | 82.35 | 81 |
| Actualizador | 94.27 | 93 | 83.01 | 81 | 100 | 98 |
| Record locks | 97.22 | 96 | 95.58 | 94 | 92.30 | 91 |
| Backups locales | 98.94 | 97 | 96.42 | 95 | 100 | 98 |
| Editor de tareas | 67.12 | 66 | 68.42 | 67 | 50.94 | 49 |

Las sentencias tienen el mismo mínimo que las líneas en cada grupo, según la medición de referencia.

## Funcionamiento

- `npm run test:coverage` ejecuta Vitest y comprueba los umbrales; el incumplimiento devuelve un código de salida distinto de cero.
- El grupo Vitest de la validación integral ya ejecuta ese comando y propaga su código de salida. No se añade otro job ni se repiten pruebas.
- Los informes de cobertura y tiempos se conservan en los artefactos de GitHub Actions.
- Para impedir el merge de una PR fallida es necesario configurar la protección de main con la comprobación requerida de validación integral. Este cambio no modifica los permisos ni las reglas del repositorio.

## Política de mantenimiento

No reducir umbrales para solucionar un fallo de CI sin una justificación técnica revisada. Añadir pruebas de comportamiento y regresión al modificar áreas críticas. Revisar los mínimos al aumentar de forma sostenida la cobertura o cambiar la instrumentación; conservar evidencias comparables y evitar excluir código únicamente para elevar porcentajes.

Una cobertura superior no demuestra ausencia de errores. No sustituye pruebas de integración, seguridad, accesibilidad, rendimiento o recuperación.

## Validación pendiente fuera de CI

Las pruebas de SQLite nativa, fallos inyectados y estrés multiproceso utilizan almacenamiento local. No certifican SMB real, cortes físicos de red, funcionamiento de 1/4/8 horas ni instalación portable en equipos reales. Realizar una auditoría independiente y pruebas con una base aislada antes de cerrar la estabilización.

