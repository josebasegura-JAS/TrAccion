import { CheckCircle2, HelpCircle, ListOrdered, Sparkles } from 'lucide-react';
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

function isFlowSection(section: ModuleHelpSection): boolean {
  return Boolean(section.ordered && section.items && section.items.length > 0);
}

function getFlowEyebrow(sectionTitle: string): string {
  if (/revisi/i.test(sectionTitle)) return 'Revisión visual';
  if (/uso|flujo/i.test(sectionTitle)) return 'Cronograma visual';
  return 'Secuencia visual';
}

function FlowSection({ section }: { section: ModuleHelpSection }) {
  const items = section.items ?? [];

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.05] shadow-sm">
      <div className="border-b border-emerald-400/15 bg-emerald-500/[0.07] px-4 py-3 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-500/15 text-emerald-200">
            <ListOrdered size={18} strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/90">
              {getFlowEyebrow(section.title)}
            </p>
            <h4 className="mt-1 text-base font-bold text-metro-text">{section.title}</h4>
            {section.body ? <div className="mt-1 text-sm text-metro-muted">{section.body}</div> : null}
          </div>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <article
                className="relative min-w-0 rounded-2xl border border-emerald-400/20 bg-metro-surface/90 p-3.5 shadow-sm"
                key={`${section.title}-${item}`}
              >
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-extrabold text-white shadow-sm">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200/90">
                      Paso {index + 1}
                    </p>
                    {isLast ? (
                      <div className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-100">
                        <CheckCircle2 size={11} strokeWidth={2.2} />
                        <span className="truncate">Cierre del flujo</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <p className="break-words text-xs leading-5 text-metro-text sm:text-[13px]">{item}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RegularSection({ section }: { section: ModuleHelpSection }) {
  return (
    <section className="rounded-2xl border border-metro-border/70 bg-metro-panel/65 p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-200">
          <Sparkles size={16} strokeWidth={2.1} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-bold text-metro-text">{section.title}</h4>
          {section.body ? <div className="mt-2 text-sm leading-6 text-metro-muted">{section.body}</div> : null}
          {section.items && section.items.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-metro-muted">
              {section.items.map((item) => (
                <li className="flex items-start gap-2 leading-6" key={`${section.title}-${item}`}>
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function ModuleHelpButton({ title, subtitle, sections, ariaLabel }: ModuleHelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const flowSections = sections.filter(isFlowSection);
  const regularSections = sections.filter((section) => !isFlowSection(section));

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
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-metro-border/80 bg-metro-surface shadow-card">
            <div className="flex items-start justify-between gap-4 border-b border-metro-border/70 bg-metro-panel px-4 py-3 sm:px-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-200">Ayuda visual</p>
                <h3 className="text-lg font-bold text-metro-text sm:text-xl">{title}</h3>
                {subtitle ? <p className="mt-1 text-sm text-metro-muted">{subtitle}</p> : null}
              </div>
              <ModalCloseButton label="Cerrar ayuda" onClick={() => setIsOpen(false)} />
            </div>

            <div className="max-h-[74vh] overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              {flowSections.length > 0 ? (
                <div className="space-y-4">
                  {flowSections.map((section) => (
                    <FlowSection key={section.title} section={section} />
                  ))}
                </div>
              ) : null}

              {regularSections.length > 0 ? (
                <div className={flowSections.length > 0 ? 'mt-5' : ''}>
                  <div className="mb-3 flex items-center gap-2">
                    <div className="h-px flex-1 bg-metro-border/70" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-metro-muted">
                      Detalle de la ayuda
                    </p>
                    <div className="h-px flex-1 bg-metro-border/70" />
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {regularSections.map((section) => (
                      <RegularSection key={section.title} section={section} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end border-t border-metro-border/70 bg-metro-panel px-4 py-2.5 sm:px-5">
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
