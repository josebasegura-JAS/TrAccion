// Genera un paquete puente compatible con instalaciones antiguas y nuevas.
// La app visible sigue siendo 1.2; la revisión técnica completa vive en version.json.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..');
const releaseDir = path.join(projectDir, 'release');
const pkg = JSON.parse(readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
const version = String(pkg.version ?? '');
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('package.json no contiene una versión técnica válida x.y.z.');
const artifactName = pkg.build?.portable?.artifactName;
if (!artifactName || typeof artifactName !== 'string' || !artifactName.toLowerCase().endsWith('.exe')) throw new Error('package.json no contiene build.portable.artifactName válido.');
const sourceExePath = path.join(releaseDir, artifactName);
if (!existsSync(sourceExePath)) throw new Error(`No se ha encontrado el portable generado: ${sourceExePath}`);

const [major, minor, patch] = version.split('.');
const currentFileName = `Traccion ${major}.${minor}.piz`;
// El manifiesto apunta temporalmente al nombre legacy porque las versiones antiguas
// solo aceptan TrAccion Vx.y.zz.piz. Las versiones nuevas aceptan ambos formatos.
const legacyFileName = `TrAccion V${major}.${minor}.${patch.padStart(2, '0')}.piz`;
const currentFilePath = path.join(releaseDir, currentFileName);
const legacyFilePath = path.join(releaseDir, legacyFileName);

copyFileSync(sourceExePath, currentFilePath);
copyFileSync(sourceExePath, legacyFilePath);

const sha256 = createHash('sha256').update(readFileSync(legacyFilePath)).digest('hex');
const manifest = { version, file: legacyFileName, sha256, mandatory: false, notes: '' };
writeFileSync(path.join(releaseDir, 'version.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Paquete actual generado: ${currentFilePath}`);
console.log(`Paquete puente legacy generado: ${legacyFilePath}`);
console.log(`Manifiesto puente: version=${version}, file=${legacyFileName}`);
console.log(`SHA-256: ${sha256}`);
