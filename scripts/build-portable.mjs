import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPortableArtifactName } from './release-version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
const artifactName = getPortableArtifactName(pkg.version);
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const result = spawnSync(
  npxCommand,
  [
    '--no-install',
    'electron-builder',
    '--win',
    'portable',
    `--config.portable.artifactName=${artifactName}`,
  ],
  { cwd: projectDir, stdio: 'inherit' },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`Portable generado como: ${artifactName}`);
