// Incrementa automáticamente el número de build de TrAccion antes de generar
// el .exe, y compone el nombre del ejecutable como "TrAccion V1.0.XX.exe".
//
// El contador de build (XX, empieza en 00) se guarda en su propio fichero
// (.build-version, fuera de package.json) porque el campo "version" de
// package.json debe ser un semver válido para electron-builder/npm, y los
// semver no admiten ceros a la izquierda en el patch (p. ej. "1.0.00" no es
// válido). Mantener un contador aparte evita ese problema sin renunciar al
// formato de nombre pedido.
//
// "version" en package.json SÍ se mantiene como semver válido (1.0.0) y no
// hace falta tocarlo en cada build; solo se actualiza build.portable.artifactName.
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
console.log(`Nombre del ejecutable: ${exeBaseName}.exe`);


