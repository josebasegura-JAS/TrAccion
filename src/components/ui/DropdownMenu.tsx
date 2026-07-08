import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface DropdownMenuItem {
  key: string;
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}

interface DropdownMenuProps {
  label: string;
  icon?: ReactNode;
  items: DropdownMenuItem[];
  align?: 'left' | 'right';
  className?: string;
}

/**
 * Botón con menú desplegable, para agrupar varias acciones secundarias
 * relacionadas (por ejemplo "Importar encuesta" + "Generar muestra") bajo un
 * único control, en vez de ocupar una fila entera con botones sueltos.
 */
export function DropdownMenu({ label, icon, items, align = 'left', className }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={`relative inline-block ${className ?? ''}`} ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
        onClick={() => setIsOpen((previous) => !previous)}
        type="button"
      >
        {icon}
        {label}
        <ChevronDown
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
          size={14}
        />
      </button>
      {isOpen && (
        <div
          className={`absolute z-20 mt-1 min-w-[240px] rounded-xl border border-metro-border bg-metro-panel p-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          role="menu"
        >
          {items.map((item) => (
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-metro-text hover:bg-metro-surface disabled:cursor-not-allowed disabled:opacity-50"
              disabled={item.disabled}
              key={item.key}
              onClick={() => {
                setIsOpen(false);
                item.onClick();
              }}
              role="menuitem"
              type="button"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
