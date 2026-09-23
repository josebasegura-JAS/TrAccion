// Genera únicamente version.json para publicar junto al portable de TrAccion.
// No duplica el EXE ni crea ZIP/PIZ. Al publicar en la carpeta de red,
// el mismo EXE generado por electron-builder se renombra manualmente a .piz.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..');
const packageJsonPath = path.join(projectDir, 'package.json');
const releaseDir = path.join(projectDir, 'release');
const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

if (!pkg.version) throw new Error('package.json no tiene un campo "version".');

const artifactName = pkg.build?.portable?.artifactName;
if (!artifactName || typeof artifactName !== 'string' || !artifactName.toLowerCase().endsWith('.exe')) {
  throw new Error('package.json no contiene build.portable.artifactName válido.');
}

const sourceExePath = path.join(releaseDir, artifactName);
if (!existsSync(sourceExePath)) {
  throw new Error(`No se ha encontrado el portable generado: ${sourceExePath}`);
}

// Renombrar .exe a .piz no modifica el contenido, por lo que el SHA-256 sigue siendo válido.
const sha256 = createHash('sha256').update(readFileSync(sourceExePath)).digest('hex');
const networkFileName = artifactName.replace(/\.exe$/i, '.piz');
const manifest = {
  version: pkg.version,
  file: networkFileName,
  sha256,
  mandatory: false,
  notes: '',
};

const manifestPath = path.join(releaseDir, 'version.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Manifiesto generado: ${manifestPath}`);
console.log(`Publicación en red: renombra ${artifactName} como ${networkFileName} y copia también version.json.`);
console.log(`SHA-256: ${sha256}`);
