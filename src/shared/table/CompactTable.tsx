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
      className={`${minWidthClassName} table-fixed text-left text-xs ${className ?? ''}`}
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
      className={`sticky top-0 z-10 bg-metro-panel text-[11px] uppercase tracking-wide text-metro-muted shadow-[0_1px_0_rgba(148,163,184,0.18)] ${className ?? ''}`}
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
      className={`divide-y divide-metro-border bg-metro-surface [&>tr:nth-child(even)]:bg-metro-panel/45 ${className ?? ''}`}
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
      <td className="px-3 py-6 text-center text-sm font-semibold text-metro-muted" colSpan={colSpan}>
        {message}
      </td>
    </tr>
  );
}
