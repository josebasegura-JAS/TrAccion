# TrAccion V1

Base limpia y mantenible para sustituir progresivamente la app RRLL Dashboard actual.

## Stack

- Electron
- React + TypeScript + Vite
- Tailwind CSS
- Zustand
- SQLite nativo preparado con `better-sqlite3` para fase posterior
- Vitest
- Playwright
- ESLint + Prettier
- Lucide React
- electron-builder

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run electron:dev
npm run electron:build
npm run test
npm run test:e2e
npm run lint
npm run format
```

## Módulo Plantilla

La primera versión incluye datos mock de plantilla completa, filtros, tabla y panel lateral de edición con pestañas de datos personales, organización, contacto y teletrabajo.

Los campos derivados preparados para teletrabajo son:

- `residenciaCast`
- `residenciaEus`
- `dni`
- `direccionTeletrabajo`

## Build Windows

El workflow manual `.github/workflows/build-windows.yml` ejecuta lint, tests, build y `electron-builder` en Windows para publicar el EXE portable como artefacto.
