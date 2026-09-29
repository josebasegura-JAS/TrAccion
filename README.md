# TrAcción 1.2

Aplicación de escritorio interna para la gestión operativa de Relaciones Laborales. Centraliza procesos, seguimiento, documentación y cálculos recurrentes en una única aplicación multiusuario.

La versión visible para usuario es **TrAcción 1.2**. El proyecto mantiene además una revisión técnica `1.2.xxx` para compilaciones y actualizaciones.

## Módulos

TrAcción incluye actualmente, entre otros:

- Dashboard y Plantilla.
- Tareas y vínculos entre procesos.
- Actas, Comité y Paritaria.
- Coordinación con Dirección, otras áreas y sindicatos.
- Ticket Restaurante.
- Teletrabajo y Licencias sin sueldo.
- Presupuestos.
- Huelgas.
- Ayuda Escolar.
- Lotería y Sorteos.
- Vinculograma.
- Especiales.
- Criterios RRLL.
- Ajustes y mantenimiento de la aplicación.

Las reglas funcionales detalladas no se mantienen en este README. Véase `docs/FUNCIONAMIENTO.md`.

## Arquitectura

- **Electron** como aplicación de escritorio Windows.
- **React + TypeScript + Vite** en renderer.
- **Zustand** para estado de interfaz y stores.
- **SQLite / better-sqlite3** como persistencia compartida y fuente de verdad de los datos de negocio.
- **ExcelJS** para importaciones y exportaciones Excel.
- Lectura de mensajes Outlook `.msg` mediante `@kenjiuno/msgreader`.
- **Vitest** para pruebas unitarias/integración y **Playwright** para pruebas UI/Electron.
- **electron-builder** para el ejecutable portable de Windows.

TrAcción está diseñada para trabajar contra la BBDD SQLite compartida. Si la BBDD requerida no está disponible, la aplicación no debe continuar silenciosamente trabajando con una copia local de los datos de negocio.

La descripción técnica completa está en `docs/ARCHITECTURE.md`.

## Documentación del proyecto

La documentación se divide deliberadamente por finalidad:

- `docs/FUNCIONAMIENTO.md` — contrato funcional: qué debe hacer TrAcción y reglas que deben conservarse.
- `docs/DECISIONS.md` — decisiones de diseño y motivos por los que se adoptaron.
- `docs/ARCHITECTURE.md` — arquitectura, persistencia, sincronización, Electron, stores y criterios técnicos.
- Ayuda integrada en cada módulo — instrucciones operativas para los usuarios de la aplicación.

Los documentos de auditorías antiguas son fotografías de una fase concreta del proyecto y no sustituyen a la documentación vigente.

## Requisitos de desarrollo

El proyecto fija la versión de Node en `.nvmrc`. Para preparar un entorno limpio:

```bash
npm ci
```

Para Playwright, cuando el entorno todavía no tenga instalados sus navegadores:

```bash
npm run playwright:install
```

## Desarrollo

Renderer Vite:

```bash
npm run dev
```

Aplicación Electron en desarrollo:

```bash
npm run electron:dev
```

Build local de TypeScript, renderer y proceso Electron:

```bash
npm run build
```

## Calidad y pruebas

Comprobaciones principales:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:ui
```

Comprobación completa disponible en el proyecto:

```bash
npm run test:all
```

Antes de modificar una regla de negocio no basta con que compile: debe contrastarse el cambio con `docs/FUNCIONAMIENTO.md`, `docs/DECISIONS.md`, los tests afectados y la ayuda visible del módulo.

## Build Windows

Los workflows principales se ejecutan manualmente desde GitHub Actions.

### Build normal

`.github/workflows/build-windows.yml`

Realiza las comprobaciones de calidad configuradas en el workflow, compila la aplicación, incrementa la revisión técnica, genera el portable y prepara el paquete de actualización.

### Build Lite

`.github/workflows/build-windows-lite.yml`

Ruta de compilación más rápida para entregas en las que no se necesita repetir toda la batería del workflow normal. No sustituye al build normal como validación completa.

Ambos generan internamente el ejecutable portable **`Traccion 1.2.exe`**, comprueban que el fichero generado es válido y preparan para distribución únicamente:

- `Traccion 1.2.piz`
- `version.json`

## Actualización

El nombre visible del ejecutable se mantiene estable como **`Traccion 1.2.exe`** aunque avance la revisión técnica `1.2.xxx`.

El actualizador utiliza:

- `version.json` para conocer la revisión disponible y validar el paquete.
- `Traccion 1.2.piz` como paquete distribuible de actualización.

El detalle del mecanismo, las responsabilidades entre proceso principal/renderer y las reglas de seguridad del actualizador se documentan en `docs/ARCHITECTURE.md` y las decisiones asociadas en `docs/DECISIONS.md`.

## Convenciones

- En textos visibles se utiliza **TrAcción**, con tilde.
- Los identificadores técnicos, rutas o nombres que puedan afectar a compatibilidad pueden conservar `TrAccion`/`Traccion` sin tilde.
- No introducir persistencia local alternativa para datos de negocio sin revisar previamente la arquitectura y las decisiones vigentes.
- No cambiar reglas funcionales implícitamente durante refactors de UI, persistencia o exportación.

## Estado del proyecto

TrAcción 1.2 es una aplicación operativa en evolución. El repositorio, la documentación funcional y las ayudas de los módulos deben actualizarse conjuntamente cuando un cambio altere el comportamiento observable de la aplicación.
