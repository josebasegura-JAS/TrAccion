# PR6B · Comparación responsable del rendimiento multiusuario

## Objetivo

Añadir una función pura que compare resúmenes `getMultiuserPerformanceReport()` de dos periodos sin tocar el colector, el proceso Electron ni SQLite. Se incorpora un juego de pruebas reproducible.

## Interpretación

- Comparar el **mismo tipo de operación y categoría**, con **al menos 20 muestras en cada periodo**. El corte de 20 es una regla de presentación mínima, no una garantía estadística.
- Variación relativa de P95: `(P95 nuevo / P95 anterior - 1) × 100`; valores negativos indican menor duración observada. No calcular variación si el P95 anterior es cero.
- Contrastar también la tasa de fallos y la cantidad de muestras. **No sumar** los P95 de operaciones para obtener un tiempo de proceso.
- Si el informe contiene 3.000 muestras, pudieron descartarse las más antiguas.
- Una operación que nunca finaliza puede no quedar medida. **N=0 no acredita ausencia de incidencias**.
- La comparación no demuestra que una versión sea más rápida o más fiable si cambian Wi-Fi/cable, número de usuarios, jornada, carga o equipo.

## Aplicación a TrAcción

Registrar un informe antes y otro después del cambio, en las mismas condiciones (dos equipos y tareas de prueba equivalentes). Evaluar por separado `ipc-wait`, `ipc-run`, `smb-lock-wait`, `smb-lock-held`, `record-lock` y `backup`. Para el informe de cierre conviene adjuntar la fecha, versiones, conectividad, volumen de operaciones y anomalías.

Esta fase añade utilidades de análisis y sus pruebas, **no cambia la UI ni la telemetría productiva**; no existe una mejora de velocidad demostrada sin mediciones A/B reales.
