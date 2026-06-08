import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  History,
  Pencil,
  Plus,
  Printer,
  Save,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ActionButtonVariant =
  | 'save'
  | 'excel'
  | 'word'
  | 'import'
  | 'print'
  | 'delete'
  | 'edit'
  | 'history'
  | 'add'
  | 'approve'
  | 'reject'
  | 'secondary';

type ActionButtonSize = 'sm' | 'md';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ActionButtonVariant;
  children?: ReactNode;
  iconOnly?: boolean;
  size?: ActionButtonSize;
}

const iconByVariant: Record<ActionButtonVariant, LucideIcon> = {
  add: Plus,
  approve: CheckCircle2,
  delete: Trash2,
  edit: Pencil,
  excel: FileSpreadsheet,
  history: History,
  import: Upload,
  print: Printer,
  reject: X,
  save: Save,
  secondary: Pencil,
  word: FileText,
};

const labelByVariant: Record<ActionButtonVariant, string> = {
  add: 'Añadir',
  approve: 'Aprobar',
  delete: 'Eliminar',
  edit: 'Editar',
  excel: 'Excel',
  history: 'Historial',
  import: 'Importar',
  print: 'Imprimir',
  reject: 'Rechazar',
  save: 'Guardar',
  secondary: 'Acción',
  word: 'Word',
};

const colorClassByVariant: Record<ActionButtonVariant, string> = {
  add: 'bg-metro-red text-white hover:bg-metro-dark border-transparent',
  approve: 'bg-emerald-600 text-white hover:bg-emerald-700 border-transparent',
  delete: 'bg-red-600 text-white hover:bg-red-700 border-transparent',
  edit: 'bg-metro-surface text-metro-text hover:border-metro-red border-metro-border',
  excel: 'bg-emerald-600 text-white hover:bg-emerald-700 border-transparent',
  history: 'bg-metro-surface text-metro-text hover:border-metro-red border-metro-border',
  import: 'bg-metro-surface text-metro-text hover:border-metro-red border-metro-border',
  print: 'bg-metro-surface text-metro-text hover:border-metro-red border-metro-border',
  reject: 'bg-metro-surface text-metro-text hover:border-metro-red border-metro-border',
  save: 'bg-metro-red text-white hover:bg-metro-dark border-transparent',
  secondary: 'bg-metro-surface text-metro-text hover:border-metro-red border-metro-border',
  word: 'bg-blue-600 text-white hover:bg-blue-700 border-transparent',
};

const sizeClassBySize: Record<ActionButtonSize, string> = {
  md: 'rounded-xl px-3 py-2 text-sm',
  sm: 'rounded-lg px-3 py-1.5 text-xs',
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function ActionButton({
  children,
  className,
  iconOnly = false,
  size = 'md',
  title,
  type = 'button',
  variant,
  ...props
}: ActionButtonProps) {
  const Icon = iconByVariant[variant];
  const label = children ?? labelByVariant[variant];
  const accessibleTitle = title ?? (typeof label === 'string' ? label : labelByVariant[variant]);

  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 border font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        sizeClassBySize[size],
        colorClassByVariant[variant],
        iconOnly && 'aspect-square px-0',
        className,
      )}
      title={accessibleTitle}
      type={type}
      {...props}
    >
      <Icon size={size === 'sm' ? 14 : 16} />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
