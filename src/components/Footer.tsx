import { Database } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useDatabaseStatus } from '../services/databaseStatus';
import { buildDatabaseStatusBadge, type DatabaseStatusTone } from '../services/databaseStatusView';
import { StatusBadge } from './ui/StatusBadge';

function getPublicAppVersion(version: string | null): string | null {
  if (!version) return null;
  const match = /^(\d+)\.(\d+)/.exec(version.trim());
  return match ? `${match[1]}.${match[2]}` : version;
}

function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const getVersion = window.traccion?.getAppVersion;
    if (!getVersion) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const currentVersion = await getVersion();
        if (!cancelled) {
          setVersion(currentVersion);
        }
      } catch (error) {
        console.warn('No se ha podido leer la versión de TrAcción.', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}

function databaseTone(tone: DatabaseStatusTone): 'success' | 'warning' | 'error' | 'muted' {
  if (tone === 'ok') {
    return 'success';
  }

  if (tone === 'error') {
    return 'error';
  }

  if (tone === 'locked') {
    return 'muted';
  }

  return 'warning';
}

export function Footer() {
  const databaseStatus = useDatabaseStatus();
  const databaseBadge = useMemo(() => buildDatabaseStatusBadge(databaseStatus), [databaseStatus]);
  const appVersion = useAppVersion();

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-black/10 px-3 text-[11px] text-slate-400">
      <span className="shrink-0">TrAcción{getPublicAppVersion(appVersion) ? ` ${getPublicAppVersion(appVersion)}` : ''}</span>
      <StatusBadge
        className="max-w-[15rem]"
        icon={<Database size={12} aria-hidden="true" />}
        size="xs"
        title={databaseBadge.title}
        tone={databaseTone(databaseBadge.tone)}
      >
        {databaseBadge.label}
      </StatusBadge>
    </footer>
  );
}
