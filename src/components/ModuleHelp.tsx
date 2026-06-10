import { HelpCircle, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export type ModuleHelpSection = {
  title: string;
  body?: ReactNode;
  items?: string[];
  ordered?: boolean;
};

interface ModuleHelpButtonProps {
  title: string;
  subtitle?: string;
  sections: ModuleHelpSection[];
  ariaLabel?: string;
}

export function ModuleHelpButton({ title, subtitle, sections, ariaLabel }: ModuleHelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        aria-label={ariaLabel ?? `Abrir ayuda de ${title}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-blue-400/70 bg-blue-500/15 text-blue-200 shadow-sm transition hover:border-blue-300 hover:bg-blue-500/25 hover:text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
        onClick={() => setIsOpen(true)}
        title={`Ayuda de ${title}`}
        type="button"
      >
        <HelpCircle size={17} strokeWidth={2.4} />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-metro-border bg-metro-surface shadow-card">
            <div className="flex items-start justify-between gap-4 border-b border-metro-border bg-metro-panel px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-200">
                  Ayuda
                </p>
                <h3 className="text-lg font-bold text-metro-text">{title}</h3>
                {subtitle ? <p className="mt-1 text-sm text-metro-muted">{subtitle}</p> : null}
              </div>
              <button
                aria-label="Cerrar ayuda"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-metro-border bg-metro-surface text-metro-muted transition hover:border-metro-red hover:text-metro-text"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X size={17} />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4 text-sm text-metro-text">
              {sections.map((section) => (
                <section key={section.title}>
                  <h4 className="font-semibold text-metro-text">{section.title}</h4>
                  {section.body ? <div className="mt-1 text-metro-muted">{section.body}</div> : null}
                  {section.items && section.items.length > 0 ? (
                    section.ordered ? (
                      <ol className="mt-2 list-decimal space-y-1 pl-5 text-metro-muted">
                        {section.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ol>
                    ) : (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-metro-muted">
                        {section.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )
                  ) : null}
                </section>
              ))}
            </div>

            <div className="flex justify-end border-t border-metro-border bg-metro-panel px-5 py-3">
              <button
                className="rounded-lg bg-metro-red px-4 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
