import { useEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered } from 'lucide-react';
import { markdownToEditorHtml, editorHtmlToMarkdown } from './visualMarkdown';

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id: string;
}

export function VisualMarkdownEditor({ value, onChange, disabled = false, id }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (!ref.current || value === lastEmitted.current) return;
    ref.current.innerHTML = markdownToEditorHtml(value);
    lastEmitted.current = value;
  }, [value]);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = markdownToEditorHtml(value);
    // Initial content is loaded once; subsequent local keystrokes must retain caret position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const emit = () => {
    if (!ref.current) return;
    const next = editorHtmlToMarkdown(ref.current.innerHTML);
    lastEmitted.current = next;
    onChange(next);
  };
  const command = (name: string) => {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(name, false);
    emit();
  };
  const tools = [
    { label: 'Negrita', icon: Bold, name: 'bold' },
    { label: 'Cursiva', icon: Italic, name: 'italic' },
    { label: 'Lista con viñetas', icon: List, name: 'insertUnorderedList' },
    { label: 'Lista numerada', icon: ListOrdered, name: 'insertOrderedList' },
  ];
  return <div className="overflow-hidden rounded-lg border border-metro-border bg-metro-surface">
    <div className="flex items-center gap-1 border-b border-metro-border bg-metro-panel px-2 py-1" aria-label="Formato de acuerdos">
      {tools.map(({ label, icon: Icon, name }) => <button key={name} type="button" aria-label={label} title={label}
        disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => command(name)}
        className="rounded-md p-2 text-metro-text hover:bg-metro-surface disabled:opacity-40"><Icon size={16}/></button>)}
    </div>
    <div id={id} ref={ref} contentEditable={!disabled} suppressContentEditableWarning role="textbox"
      aria-label="Resultado / acuerdos" aria-multiline="true" onInput={emit} onBlur={emit}
      onPaste={event => {
        event.preventDefault();
        // Pasting as plain text avoids injecting arbitrary markup into the saved Markdown.
        const plain = event.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, plain);
        emit();
      }}
      className="min-h-56 px-3 py-2 text-sm leading-relaxed text-metro-text outline-none whitespace-pre-wrap [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc"
      data-placeholder="Escribe aquí lo tratado, los acuerdos y los próximos pasos..." />
  </div>;
}
