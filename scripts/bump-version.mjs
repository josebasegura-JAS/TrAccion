// Incrementa automáticamente el número de build de TrAccion antes de generar
// el .exe, y compone el nombre del ejecutable como "TrAccion V1.0.XX.exe".
//
// El contador de build (XX, empieza en 00) se guarda en su propio fichero
// (.build-version, fuera de package.json) para mantener el formato de
// nombre de fichero con ceros a la izquierda pedido ("V1.0.00", "V1.0.01"...).
//
// "version" en package.json AHORA SÍ se actualiza en cada build (a partir
// de la actualización automática añadida en 2026, el patch de
// package.json.version pasa a ser exactamente el mismo contador de build:
// es la fuente de verdad que lee app.getVersion() en tiempo de ejecución
// para que la app pueda compararse contra el manifiesto version.txt de la
// carpeta de actualizaciones y saber si hay una versión más nueva
// disponible). major y minor de package.json no cambian con este script;
// solo se incrementan a mano si se decide un cambio de versión mayor.
//
// Se ejecuta con `node scripts/bump-version.mjs` y se invoca automáticamente
// antes de `electron-builder` desde el script "electron:build" de package.json.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const buildCounterPath = path.join(__dirname, '..', '.build-version');

const previousBuildNumber = existsSync(buildCounterPath)
  ? Number.parseInt(readFileSync(buildCounterPath, 'utf8').trim(), 10)
  : -1; // -1 para que el primer build generado sea el 00, no el 01.

if (Number.isNaN(previousBuildNumber)) {
  throw new Error(`El contenido de ${buildCounterPath} no es un número válido.`);
}

const nextBuildNumber = previousBuildNumber + 1;
writeFileSync(buildCounterPath, `${nextBuildNumber}\n`);

const raw = readFileSync(packageJsonPath, 'utf8');
const pkg = JSON.parse(raw);

const match = /^(\d+)\.(\d+)\.\d+$/.exec(pkg.version ?? '');
if (!match) {
  throw new Error(
    `No se ha podido interpretar la versión actual "${pkg.version}". Debe tener el formato MAJOR.MINOR.PATCH (ej. 1.0.0).`,
  );
}
const [, major, minor] = match;

const displayBuildNumber = String(nextBuildNumber).padStart(2, '0');
const exeBaseName = `TrAccion V${major}.${minor}.${displayBuildNumber}`;

// El patch de package.json.version (semver, sin ceros a la izquierda) pasa
// a ser exactamente el mismo contador de build que ya se usaba para el
// nombre del .exe. Es la versión que lee app.getVersion() en tiempo de
// ejecución para la comprobación de actualizaciones.
pkg.version = `${major}.${minor}.${nextBuildNumber}`;

if (!pkg.build) {
  throw new Error('package.json no tiene una sección "build" (configuración de electron-builder).');
}
if (!pkg.build.portable) {
  pkg.build.portable = {};
}
pkg.build.portable.artifactName = `${exeBaseName}.exe`;

// Conserva el formato del archivo (2 espacios de indentación + salto de línea final).
writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Build nº ${displayBuildNumber}`);
console.log(`Versión de la app (package.json.version): ${pkg.version}`);
console.log(`Nombre del ejecutable: ${exeBaseName}.exe`);


