import type { HTMLAttributes, ReactNode, TableHTMLAttributes } from 'react';
import { Inbox } from 'lucide-react';

export type CompactTableDensity = 'compact' | 'comfortable';

interface CompactTableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  minWidthClassName?: string;
  density?: CompactTableDensity;
}

const densityClassName: Record<
  CompactTableDensity,
  { table: string; headerCell: string; bodyCell: string }
> = {
  compact: {
    table: 'text-[12px] leading-4',
    headerCell: '[&>tr>th]:px-2.5 [&>tr>th]:py-2',
    bodyCell: '[&>tr>td]:px-2.5 [&>tr>td]:py-1.5',
  },
  comfortable: {
    table: 'text-[13px] leading-5',
    headerCell: '[&>tr>th]:px-3 [&>tr>th]:py-2.5',
    bodyCell: '[&>tr>td]:px-3 [&>tr>td]:py-2.5',
  },
};

export function CompactTable({
  children,
  className,
  minWidthClassName = 'min-w-full',
  density = 'compact',
  ...props
}: CompactTableProps) {
  return (
    <table
      className={`${minWidthClassName} table-fixed text-left ${densityClassName[density].table} ${className ?? ''}`}
      data-density={density}
      {...props}
    >
      {children}
    </table>
  );
}

interface CompactTableHeadProps extends HTMLAttributes<HTMLTableSectionElement> {
  density?: CompactTableDensity;
}

export function CompactTableHead({
  children,
  className,
  density = 'compact',
  ...props
}: CompactTableHeadProps) {
  return (
    <thead
      className={`sticky top-0 z-10 bg-metro-topbar/95 text-[11px] font-bold uppercase tracking-[0.06em] text-metro-muted shadow-[0_1px_0_rgba(148,163,184,0.16)] backdrop-blur [&>tr>th]:align-middle ${densityClassName[density].headerCell} ${className ?? ''}`}
      {...props}
    >
      {children}
    </thead>
  );
}

interface CompactTableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {
  density?: CompactTableDensity;
  strongZebra?: boolean;
}

export function CompactTableBody({
  children,
  className,
  density = 'compact',
  strongZebra = false,
  ...props
}: CompactTableBodyProps) {
  const zebraClassName = strongZebra
    ? '[&>tr:nth-child(odd)]:bg-[#10243b]/45 [&>tr:nth-child(even)]:bg-[#1a3048]/62'
    : '[&>tr:nth-child(odd)]:bg-transparent [&>tr:nth-child(even)]:bg-metro-panel/28';

  return (
    <tbody
      className={`divide-y divide-metro-border/55 bg-metro-surface/75 ${densityClassName[density].bodyCell} ${zebraClassName} [&>tr]:transition-colors [&>tr:hover]:bg-sky-400/[0.08] ${className ?? ''}`}
      {...props}
    >
      {children}
    </tbody>
  );
}

interface CompactTableHeaderCellProps extends HTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
}

export function CompactTableHeaderCell({
  align = 'left',
  children,
  className,
  ...props
}: CompactTableHeaderCellProps) {
  return (
    <th
      className={`${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'} font-bold ${className ?? ''}`}
      scope="col"
      {...props}
    >
      {children}
    </th>
  );
}

interface CompactTableCellProps extends HTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
  truncate?: boolean;
}

export function CompactTableCell({
  align = 'left',
  children,
  className,
  truncate = false,
  ...props
}: CompactTableCellProps) {
  return (
    <td
      className={`${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'} ${truncate ? 'truncate' : ''} ${className ?? ''}`}
      {...props}
    >
      {children}
    </td>
  );
}

interface CompactTableEmptyProps {
  colSpan: number;
  message: string;
  title?: string;
}

export function CompactTableEmpty({
  colSpan,
  message,
  title = 'Sin registros',
}: CompactTableEmptyProps) {
  return (
    <tr>
      <td className="px-3 py-6 text-center text-metro-muted" colSpan={colSpan}>
        <div className="flex flex-col items-center gap-2">
          <Inbox aria-hidden="true" className="text-metro-muted/60" size={26} />
          <div>
            <p className="text-sm font-semibold text-metro-text">{title}</p>
            <p className="mt-0.5 text-xs text-metro-muted">{message}</p>
          </div>
        </div>
      </td>
    </tr>
  );
}
