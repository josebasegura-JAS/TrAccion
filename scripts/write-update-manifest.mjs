// Genera el paquete de actualización definitivo de TrAcción 1.2.
// La revisión técnica completa vive en version.json; el nombre visible permanece estable.
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

const [major, minor] = version.split('.');
const updateFileName = `Traccion ${major}.${minor}.piz`;
const updateFilePath = path.join(releaseDir, updateFileName);

copyFileSync(sourceExePath, updateFilePath);

const sha256 = createHash('sha256').update(readFileSync(updateFilePath)).digest('hex');
const manifest = { version, file: updateFileName, sha256, mandatory: false, notes: '' };
writeFileSync(path.join(releaseDir, 'version.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Paquete de actualización generado: ${updateFilePath}`);
console.log(`Manifiesto: version=${version}, file=${updateFileName}`);
console.log(`SHA-256: ${sha256}`);
