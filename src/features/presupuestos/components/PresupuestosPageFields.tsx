import { Calculator } from 'lucide-react';
import type { ReactNode } from 'react';
import { FieldLabel, Input } from '../../../components/ui/Field';

export function NumberField({
  label,
  min = 0,
  onChange,
  step = '0.01',
  value,
}: {
  label: string;
  min?: number;
  onChange: (value: number) => void;
  step?: string;
  value: number;
}) {
  return (
    <FieldLabel className="space-y-1">
      {label}
      <Input
        className="mt-1"
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={value}
      />
    </FieldLabel>
  );
}

export function TextField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <FieldLabel className="space-y-1">
      {label}
      <Input
        className="mt-1"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
    </FieldLabel>
  );
}

export function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-2xl border border-metro-border bg-metro-panel p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-metro-text">
        <Calculator size={18} className="text-metro-red" />
        {title}
      </h3>
      {children}
    </section>
  );
}
