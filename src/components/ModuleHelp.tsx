import { CheckCircle2, ChevronLeft, ChevronRight, HelpCircle, Sparkles } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { ModalCloseButton } from './ui/ModalCloseButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from './ui/ModalShell';

export type ModuleHelpFlowStep = {
  title?: string;
  action: string;
  check?: string;
  result?: string;
};

export type ModuleHelpSection = {
  title: string;
  body?: ReactNode;
  items?: string[];
  ordered?: boolean;
  flowSteps?: ModuleHelpFlowStep[];
};

interface ModuleHelpButtonProps {
  title: string;
  subtitle?: string;
  sections: ModuleHelpSection[];
  ariaLabel?: string;
}

function isFlowSection(section: ModuleHelpSection): boolean {
  return Boolean(
    (section.flowSteps && section.flowSteps.length > 0) ||
      (section.ordered && section.items && section.items.length > 0),
  );
}

function fallbackTitle(item: string, index: number): string {
  const firstSentence = item.split(/[.:;]/, 1)[0]?.trim();
  if (firstSentence && firstSentence.length <= 42) return firstSentence;
  return `Paso ${index + 1}`;
}

function getFlowSteps(section: ModuleHelpSection): ModuleHelpFlowStep[] {
  if (section.flowSteps?.length) return section.flowSteps;
  return (section.items ?? []).map((item, index) => ({
    title: fallbackTitle(item, index),
    action: item,
  }));
}

function FlowSection({ section }: { section: ModuleHelpSection }) {
  const steps = useMemo(() => getFlowSteps(section), [section]);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeStep = steps[Math.min(activeIndex, Math.max(steps.length - 1, 0))];

  if (!activeStep) return null;

  const goPrevious = () => setActiveIndex((current) => Math.max(0, current - 1));
  const goNext = () => setActiveIndex((current) => Math.min(steps.length - 1, current + 1));

  return (
    <section className="min-w-0 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.045] p-3 sm:p-4">
      <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200/85">Guía de proceso</p>
          <h4 className="mt-0.5 text-sm font-bold text-metro-text sm:text-base">{section.title}</h4>
          {section.body ? <div className="mt-1 text-xs leading-5 text-metro-muted sm:text-sm">{section.body}</div> : null}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-100">
          {activeIndex + 1} / {steps.length}
        </span>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {steps.map((step, index) => {
          const active = index === activeIndex;
          const completed = index < activeIndex;
          return (
            <button
              aria-current={active ? 'step' : undefined}
              className={`min-w-0 rounded-xl border px-2 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-300 ${
                active
                  ? 'border-emerald-300/60 bg-emerald-500/15 text-metro-text'
                  : completed
                    ? 'border-emerald-400/20 bg-emerald-500/[0.07] text-metro-text'
                    : 'border-metro-border/70 bg-metro-surface/75 text-metro-muted hover:border-emerald-400/30 hover:text-metro-text'
              }`}
              key={`${section.title}-${index}`}
              onClick={() => setActiveIndex(index)}
              type="button"
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    active || completed ? 'bg-emerald-500 text-white' : 'bg-metro-panel text-metro-muted'
                  }`}
                >
                  {completed ? <CheckCircle2 size={12} strokeWidth={2.4} /> : index + 1}
                </span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em]">Paso {index + 1}</span>
              </div>
              <p className="line-clamp-2 break-words text-[11px] font-semibold leading-4 sm:text-xs">
                {step.title ?? `Paso ${index + 1}`}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-xl border border-metro-border/70 bg-metro-surface/85 p-3">
        <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200/90">Paso {activeIndex + 1}</p>
            <h5 className="truncate text-sm font-bold text-metro-text">{activeStep.title ?? `Paso ${activeIndex + 1}`}</h5>
          </div>
          {activeIndex === steps.length - 1 ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-100">
              <CheckCircle2 size={11} strokeWidth={2.2} /> Cierre
            </span>
          ) : null}
        </div>

        <div className={`grid min-w-0 gap-3 text-xs leading-5 sm:text-[13px] ${activeStep.check || activeStep.result ? 'md:grid-cols-3' : ''}`}>
          <div className="min-w-0">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-metro-muted">Qué haces</p>
            <p className="break-words text-metro-text">{activeStep.action}</p>
          </div>
          {activeStep.check ? (
            <div className="min-w-0">
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-metro-muted">Qué controla TrAccion</p>
              <p className="break-words text-metro-text">{activeStep.check}</p>
            </div>
          ) : null}
          {activeStep.result ? (
            <div className="min-w-0">
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-metro-muted">Resultado</p>
              <p className="break-words text-metro-text">{activeStep.result}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-metro-border/60 pt-2">
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-metro-border px-2.5 py-1.5 text-xs font-semibold text-metro-muted transition hover:text-metro-text disabled:cursor-not-allowed disabled:opacity-35"
            disabled={activeIndex === 0}
            onClick={goPrevious}
            type="button"
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <p className="hidden text-[10px] text-metro-muted sm:block">Pulsa cualquier paso para consultarlo directamente.</p>
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-35"
            disabled={activeIndex === steps.length - 1}
            onClick={goNext}
            type="button"
          >
            Siguiente <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}

function RegularSection({ section }: { section: ModuleHelpSection }) {
  return (
    <section className="min-w-0 rounded-xl border border-metro-border/70 bg-metro-panel/65 p-3">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-blue-400/20 bg-blue-500/10 text-blue-200">
          <Sparkles size={14} strokeWidth={2.1} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-metro-text">{section.title}</h4>
          {section.body ? <div className="mt-1 text-xs leading-5 text-metro-muted sm:text-[13px]">{section.body}</div> : null}
          {section.items && section.items.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-xs leading-5 text-metro-muted sm:text-[13px]">
              {section.items.map((item) => (
                <li className="flex min-w-0 items-start gap-2" key={`${section.title}-${item}`}>
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-blue-300" />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{item}</span>
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
        <ModalShell labelledBy="module-help-title" maxWidthClassName="max-w-5xl" onClose={() => setIsOpen(false)}>
          <ModalHeader className="bg-metro-panel">
            <ModalTitle id="module-help-title" subtitle={subtitle}>
              {title}
            </ModalTitle>
            <ModalCloseButton label="Cerrar ayuda" onClick={() => setIsOpen(false)} />
          </ModalHeader>

          <ModalBody className="min-w-0 overflow-x-hidden">
            <div className="min-w-0" data-testid="module-help-body">
              {flowSections.length > 0 ? (
                <div className="min-w-0 space-y-3">
                  {flowSections.map((section) => (
                    <FlowSection key={section.title} section={section} />
                  ))}
                </div>
              ) : null}

              {regularSections.length > 0 ? (
                <div className={flowSections.length > 0 ? 'mt-4 min-w-0' : 'min-w-0'}>
                  <div className="mb-2 flex min-w-0 items-center gap-2">
                    <div className="h-px flex-1 bg-metro-border/70" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-metro-muted">Consulta rápida</p>
                    <div className="h-px flex-1 bg-metro-border/70" />
                  </div>
                  <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                    {regularSections.map((section) => (
                      <RegularSection key={section.title} section={section} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </ModalBody>

          <ModalFooter className="bg-metro-panel">
            <button
              className="rounded-lg bg-metro-red px-4 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              Cerrar
            </button>
          </ModalFooter>
        </ModalShell>
      ) : null}
    </>
  );
}
