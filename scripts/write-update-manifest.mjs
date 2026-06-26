// Escribe release/version.txt con la versión de package.json justo después
// de que electron-builder haya generado el .exe portable. Ese fichero es el
// manifiesto que la app comprueba en la carpeta de actualizaciones
// configurada (Ajustes > Actualizaciones): si version.txt ahí es más nuevo
// que la versión actual de la app (app.getVersion()), ofrece actualizar.
//
// Para publicar una actualización, basta con copiar el contenido de
// release/ (el .exe nuevo + este version.txt) a la carpeta de
// actualizaciones de red; no hace falta editar nada a mano.
//
// Se ejecuta con `node scripts/write-update-manifest.mjs` y se invoca
// automáticamente después de `electron-builder` desde el script
// "electron:build" de package.json.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const releaseDir = path.join(__dirname, '..', 'release');
const manifestPath = path.join(releaseDir, 'version.txt');

const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
if (!pkg.version) {
  throw new Error('package.json no tiene un campo "version".');
}

if (!existsSync(releaseDir)) {
  mkdirSync(releaseDir, { recursive: true });
}

// Una sola línea con la versión semver (ej. "1.0.34"). La app la compara
// contra app.getVersion() con un orden numérico simple por partes, no como
// texto, para que "1.0.9" se entienda como anterior a "1.0.10".
writeFileSync(manifestPath, `${pkg.version}\n`, 'utf8');

console.log(`Manifiesto de actualización escrito: ${manifestPath} (versión ${pkg.version})`);
