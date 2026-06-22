import type { ReactNode } from 'react';
import { ModuleHelpButton, type ModuleHelpSection } from '../ModuleHelp';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

interface PageHeaderProps {
  /** Small uppercase label above the title, e.g. the module name. Defaults to `title` if omitted. */
  eyebrow?: ReactNode;
  /** Main heading text. */
  title: ReactNode;
  /** Short description shown under the title. */
  subtitle?: ReactNode;
  /** Buttons / controls aligned to the right (e.g. ActionButton group). */
  actions?: ReactNode;
  /** If provided, renders a ModuleHelpButton next to the title using these sections. */
  helpSections?: ModuleHelpSection[];
  /** Help dialog title; defaults to `title` (must be a string when helpSections is used and title is a ReactNode). */
  helpTitle?: string;
  /** Help dialog subtitle. */
  helpSubtitle?: string;
  className?: string;
}

/**
 * Standard page/module header: eyebrow label, title (+ optional help button),
 * subtitle, and right-aligned actions. Mirrors the header block already used
 * across feature pages (e.g. Especiales, Criterios RRLL) so it can be dropped
 * in without changing the page's outer wrapper/card.
 */
export function PageHeader({
  actions,
  className,
  eyebrow,
  helpSections,
  helpSubtitle,
  helpTitle,
  subtitle,
  title,
}: PageHeaderProps) {
  const resolvedHelpTitle = helpTitle ?? (typeof title === 'string' ? title : undefined);

  return (
    <div className={cx('mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between', className)}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
          {eyebrow ?? title}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-bold text-metro-text">{title}</h2>
          {helpSections && resolvedHelpTitle ? (
            <ModuleHelpButton title={resolvedHelpTitle} subtitle={helpSubtitle} sections={helpSections} />
          ) : null}
        </div>
        {subtitle ? <p className="mt-0.5 text-base text-metro-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
