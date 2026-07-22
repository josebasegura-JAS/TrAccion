import { HelpCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ModalCloseButton } from './ui/ModalCloseButton';

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
        data-tip={`Ayuda de ${title}`}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <HelpCircle size={17} strokeWidth={2.4} />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-xl border border-metro-border/80 bg-metro-surface shadow-card">
            <div className="flex items-start justify-between gap-4 border-b border-metro-border/70 bg-metro-panel px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-blue-200">
                  Ayuda
                </p>
                <h3 className="text-lg font-bold text-metro-text">{title}</h3>
                {subtitle ? <p className="mt-1 text-sm text-metro-muted">{subtitle}</p> : null}
              </div>
              <ModalCloseButton label="Cerrar ayuda" onClick={() => setIsOpen(false)} />
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-3 text-sm text-metro-text">
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

            <div className="flex justify-end border-t border-metro-border/70 bg-metro-panel px-4 py-2.5">
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
