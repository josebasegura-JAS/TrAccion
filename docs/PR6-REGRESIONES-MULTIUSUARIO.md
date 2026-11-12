# PR6A · Regresiones deterministas de cola SQLite tras cortes de red

Las pruebas en `electron/sqliteIpcQueue.test.ts` amplían escenarios de pérdida de respuesta SMB y recuperación **sin cambiar el código productivo**. Se controla el reloj de Vitest mediante temporizadores simulados y se resuelven o rechazan explícitamente las promesas que representan la escritura real.

## Garantías comprobadas

- Un timeout de 12 segundos es un límite de respuesta, **no una cancelación**.
- Mientras el primer guardado sigue pendiente, ni lecturas ni nuevas escrituras se adelantan.
- El guardado no se reintenta ni ejecuta dos veces por la cola.
- Tras la finalización correcta o el error tardío, se procesan las operaciones pendientes en orden y el diagnóstico vuelve a estado inactivo.

## Límites

Los tests no simulan un servidor SMB auténtico, caída de alimentación, Windows suspendido ni una desconexión real cable/Wi-Fi. No garantizan por sí solos integridad entre procesos distintos. Ejecutar también el protocolo de dos equipos descrito en `docs/MULTIUSER-SMB-PERFORMANCE-DIAGNOSTICS.md` y conservar evidencias de ambos equipos.
