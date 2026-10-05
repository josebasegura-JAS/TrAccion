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
  | 'primary'
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
  | 'create'
  | 'add'
  | 'approve'
  | 'reject'
  | 'secondary';

type ActionButtonSize = 'sm' | 'md';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ActionButtonVariant;
  children?: ReactNode;
  iconOnly?: boolean;
  /** Sobrescribe el icono por defecto de la variante. */
  icon?: ActionButtonIcon;
  /** Muestra un spinner en lugar del icono de la variante y deshabilita el botón. */
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

const iconByVariant: Partial<Record<ActionButtonVariant, ActionButtonIcon>> = {
  add: Plus,
  approve: CheckCircle2,
  create: Plus,
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
  word: WordIcon,
};

const labelByVariant: Record<ActionButtonVariant, string> = {
  primary: 'Continuar',
  create: 'Crear',
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

const secondaryActionClass =
  'bg-metro-panel/85 text-metro-text hover:border-metro-red border-metro-border hover:bg-metro-raised';

const colorClassByVariant: Record<ActionButtonVariant, string> = {
  primary: 'bg-metro-red text-white hover:bg-metro-dark border-transparent',
  create: 'bg-metro-red text-white hover:bg-metro-dark border-transparent',
  add: 'bg-metro-red text-white hover:bg-metro-dark border-transparent',
  approve: 'bg-emerald-700 text-white hover:bg-emerald-800 border-transparent',
  delete: 'border-red-500/45 bg-red-950/20 text-red-200 hover:bg-red-950/35',
  duplicate: secondaryActionClass,
  edit: secondaryActionClass,
  excel: secondaryActionClass,
  history: secondaryActionClass,
  import: secondaryActionClass,
  outlook: secondaryActionClass,
  print: secondaryActionClass,
  reject: secondaryActionClass,
  save: 'bg-metro-red text-white hover:bg-metro-dark border-transparent',
  secondary: secondaryActionClass,
  word: secondaryActionClass,
};

const sizeClassBySize: Record<ActionButtonSize, string> = {
  md: 'h-10 rounded-xl px-3.5 text-sm',
  sm: 'h-8 rounded-lg px-2.5 text-xs',
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function ActionButton({
  children,
  className,
  disabled,
  icon: iconOverride,
  iconOnly = false,
  loading = false,
  size = 'sm',
  title,
  type = 'button',
  variant,
  ...props
}: ActionButtonProps) {
  const Icon = iconOverride ?? iconByVariant[variant];
  const label = children ?? labelByVariant[variant];
  const accessibleTitle = title ?? (typeof label === 'string' ? label : labelByVariant[variant]);
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <button
      aria-busy={loading}
      aria-label={accessibleTitle}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border font-semibold transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-metro-red disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
        sizeClassBySize[size],
        colorClassByVariant[variant],
        iconOnly && 'aspect-square px-0',
        className,
      )}
      data-tip={iconOnly ? accessibleTitle : title}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? (
        <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" size={iconSize} />
      ) : Icon ? (
        <span aria-hidden="true" className="inline-flex">
          <Icon size={iconSize} />
        </span>
      ) : null}
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
