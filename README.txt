TrAcción - incremental diagnóstico de arranque

Archivos modificados:
- electron/main.ts
- build/icon/splash.html
- build/icon/splash.js (nuevo)

La pantalla de arranque muestra por fases:
1. Preparando aplicación
2. Cargando motor de datos
3. Conectando y verificando base de datos
4. Preparando servicios internos
5. Cargando interfaz de usuario

Estados:
- reloj/spinner animado: en curso
- check verde: completado
- aspa roja + detalle: error
- contador de segundos por fase
- progreso global

El timeout de interfaz pasa de 25s a 60s para que sea posible identificar bloqueos lentos antes de abrir la ventana principal.
