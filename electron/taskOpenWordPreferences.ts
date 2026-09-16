import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PREFERENCES_FILE_NAME = 'task-word-preferences.json';

interface TaskWordPreferences {
  directoryPath: string | null;
}

function getPreferencesPath(): string {
  return path.join(app.getPath('userData'), PREFERENCES_FILE_NAME);
}

export async function getOpenTasksWordDirectory(): Promise<string | null> {
  try {
    const raw = await readFile(getPreferencesPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const directoryPath = (parsed as Partial<TaskWordPreferences>).directoryPath;
    return typeof directoryPath === 'string' && directoryPath.trim()
      ? directoryPath
      : null;
  } catch {
    return null;
  }
}

export async function setOpenTasksWordDirectory(directoryPath: string): Promise<string> {
  const normalized = path.resolve(directoryPath);
  await mkdir(path.dirname(getPreferencesPath()), { recursive: true });
  await writeFile(
    getPreferencesPath(),
    JSON.stringify({ directoryPath: normalized } satisfies TaskWordPreferences, null, 2),
    'utf8',
  );
  return normalized;
}

export async function clearOpenTasksWordDirectory(): Promise<void> {
  await mkdir(path.dirname(getPreferencesPath()), { recursive: true });
  await writeFile(
    getPreferencesPath(),
    JSON.stringify({ directoryPath: null } satisfies TaskWordPreferences, null, 2),
    'utf8',
  );
}
