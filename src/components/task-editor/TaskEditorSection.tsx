import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function TaskEditorSection({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-sky-300/10 bg-[#0f2238]/85 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <div className="mb-2.5 flex min-w-0 items-center justify-between gap-3">
        <h4 className="inline-flex min-w-0 items-center gap-2 text-sm font-extrabold text-slate-100">
          <Icon className="shrink-0 text-sky-200" size={16} />
          <span className="truncate">{title}</span>
        </h4>
        {action}
      </div>
      {children}
    </section>
  );
}
