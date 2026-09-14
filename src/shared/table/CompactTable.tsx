import type { HTMLAttributes, ReactNode, TableHTMLAttributes } from 'react';

interface CompactTableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  minWidthClassName?: string;
}

export function CompactTable({
  children,
  className,
  minWidthClassName = 'min-w-full',
  ...props
}: CompactTableProps) {
  return (
    <table
      className={`${minWidthClassName} table-fixed text-left text-[13px] leading-5 ${className ?? ''}`}
      {...props}
    >
      {children}
    </table>
  );
}

export function CompactTableHead({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={`sticky top-0 z-10 bg-metro-topbar/95 text-[11px] font-bold uppercase tracking-[0.06em] text-metro-muted shadow-[0_1px_0_rgba(148,163,184,0.16)] backdrop-blur ${className ?? ''}`}
      {...props}
    >
      {children}
    </thead>
  );
}

export function CompactTableBody({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={`divide-y divide-metro-border/55 bg-metro-surface/75 [&>tr]:transition-colors [&>tr:nth-child(odd)]:bg-[#10243b]/45 [&>tr:nth-child(even)]:bg-[#1a3048]/62 [&>tr:hover]:bg-sky-400/[0.08] ${className ?? ''}`}
      {...props}
    >
      {children}
    </tbody>
  );
}

interface CompactTableEmptyProps {
  colSpan: number;
  message: string;
}

export function CompactTableEmpty({ colSpan, message }: CompactTableEmptyProps) {
  return (
    <tr>
      <td className="px-3 py-5 text-center text-sm font-semibold text-metro-muted" colSpan={colSpan}>
        {message}
      </td>
    </tr>
  );
}
