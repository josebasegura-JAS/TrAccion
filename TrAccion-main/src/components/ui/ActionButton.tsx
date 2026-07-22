import {
  CheckCircle2,
  Clock3,
  Copy,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Printer,
  Save,
  Trash2,
  Upload,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ButtonHTMLAttributes, FC, ReactNode } from 'react';

type ActionButtonVariant =
  | 'save'
  | 'excel'
  | 'word'
  | 'outlook'
  | 'import'
  | 'print'
  | 'delete'
  | 'duplicate'
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
  /** Sobrescribe el icono por defecto de la variante (p. ej. cuando el texto no encaja con el icono habitual, como "Nuevo tipo" sobre la variante "secondary"). Evita tener que colar un icono a mano dentro de children, que duplicaría el icono. */
  icon?: ActionButtonIcon;
  /** Muestra un spinner en lugar del icono de la variante y deshabilita el botón. Pensado para operaciones que tardan (guardar, importar, compactar, diagnosticar...). */
  loading?: boolean;
  size?: ActionButtonSize;
}

type ActionButtonIcon = LucideIcon | FC<{ size: number }>;

function ExcelIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" focusable="false" height={size} viewBox="0 0 16 16" width={size}>
      <rect fill="#217346" height="16" rx="3" width="16" />
      <text
        fill="#ffffff"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="10"
        fontWeight="700"
        textAnchor="middle"
        x="8"
        y="11.5"
      >
        X
      </text>
    </svg>
  );
}

function WordIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" focusable="false" height={size} viewBox="0 0 16 16" width={size}>
      <rect fill="#2b579a" height="16" rx="3" width="16" />
      <text
        fill="#ffffff"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="10"
        fontWeight="700"
        textAnchor="middle"
        x="8"
        y="11.5"
      >
        W
      </text>
    </svg>
  );
}

const iconByVariant: Record<ActionButtonVariant, ActionButtonIcon | undefined> = {
  add: Plus,
  approve: CheckCircle2,
  delete: Trash2,
  duplicate: Copy,
  edit: Pencil,
  excel: ExcelIcon,
  history: Clock3,
  import: Upload,
  outlook: Mail,
  print: Printer,
  reject: XCircle,
  save: Save,
  secondary: undefined,
  word: WordIcon,
};

const labelByVariant: Record<ActionButtonVariant, string> = {
  add: 'Añadir',
  approve: 'Aprobar',
  delete: 'Eliminar',
  duplicate: 'Duplicar',
  edit: 'Editar',
  excel: 'Excel',
  history: 'Historial',
  import: 'Importar',
  outlook: 'Outlook',
  print: 'Imprimir',
  reject: 'Rechazar',
  save: 'Guardar',
  secondary: 'Acción',
  word: 'Word',
};

const colorClassByVariant: Record<ActionButtonVariant, string> = {
  add: 'bg-metro-red text-white hover:bg-metro-dark border-transparent',
  approve: 'bg-emerald-700 text-white hover:bg-emerald-800 border-transparent',
  delete: 'border-red-500 bg-transparent text-red-400 hover:bg-red-950/40',
  duplicate: 'bg-metro-surface text-metro-text hover:border-metro-red border-metro-border',
  edit: 'bg-metro-surface text-metro-text hover:border-metro-red border-metro-border',
  excel: 'bg-[#1a5c38] text-white hover:bg-[#217346] border-transparent',
  history: 'bg-metro-surface text-metro-text hover:border-metro-red border-metro-border',
  import: 'bg-metro-surface text-metro-text hover:border-metro-red border-metro-border',
  outlook: 'bg-[#0078d4] text-white hover:bg-[#106ebe] border-transparent',
  print: 'bg-metro-surface text-metro-text hover:border-metro-red border-metro-border',
  reject: 'bg-metro-surface text-metro-text hover:border-metro-red border-metro-border',
  save: 'bg-metro-red text-white hover:bg-metro-dark border-transparent',
  secondary: 'bg-metro-surface text-metro-text hover:border-metro-red border-metro-border',
  word: 'bg-[#1e3f6f] text-white hover:bg-[#2b579a] border-transparent',
};

const sizeClassBySize: Record<ActionButtonSize, string> = {
  md: 'h-10 rounded-xl px-3 text-sm',
  sm: 'h-9 rounded-lg px-3 text-xs',
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function ActionButton({
  children,
  className,
  disabled,
  icon,
  iconOnly = true,
  loading = false,
  size = 'md',
  title,
  type = 'button',
  variant,
  ...props
}: ActionButtonProps) {
  const Icon = icon ?? iconByVariant[variant];
  const label = children ?? labelByVariant[variant];
  const accessibleTitle = title ?? (typeof label === 'string' ? label : labelByVariant[variant]);
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 border font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        sizeClassBySize[size],
        colorClassByVariant[variant],
        iconOnly && 'aspect-square px-0',
        className,
      )}
      aria-busy={loading}
      aria-label={accessibleTitle}
      disabled={disabled || loading}
      // Tooltip rápido global (TooltipLayer): siempre en botones de solo
      // icono; en botones con texto, solo si el llamante aporta un title con
      // información extra.
      data-tip={iconOnly ? accessibleTitle : title}
      type={type}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin" size={iconSize} />
      ) : Icon ? (
        <Icon size={iconSize} />
      ) : null}
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
