// Genera el paquete de actualización para cualquier rama MAJOR.MINOR de TrAcción.
// package.json.version es la única fuente de verdad para nombres de distribución.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPortableArtifactName, getUpdatePackageName, parseTechnicalVersion } from './release-version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..');
const releaseDir = path.join(projectDir, 'release');
const pkg = JSON.parse(readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
const version = String(pkg.version ?? '');
parseTechnicalVersion(version);

const artifactName = getPortableArtifactName(version);
const sourceExePath = path.join(releaseDir, artifactName);
if (!existsSync(sourceExePath)) throw new Error(`No se ha encontrado el portable generado: ${sourceExePath}`);

const updateFileName = getUpdatePackageName(version);
const updateFilePath = path.join(releaseDir, updateFileName);
copyFileSync(sourceExePath, updateFilePath);

const sha256 = createHash('sha256').update(readFileSync(updateFilePath)).digest('hex');
const manifest = { version, file: updateFileName, sha256, mandatory: false, notes: '' };
writeFileSync(path.join(releaseDir, 'version.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Portable origen: ${artifactName}`);
console.log(`Paquete de actualización generado: ${updateFilePath}`);
console.log(`Manifiesto: version=${version}, file=${updateFileName}`);
console.log(`SHA-256: ${sha256}`);
