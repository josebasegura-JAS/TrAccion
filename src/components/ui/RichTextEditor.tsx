import { Bold, Italic, List, ListOrdered } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { sanitizeRichText } from './richText';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
}

/**
 * contentEditable + document.execCommand, no una librería externa: el
 * alcance pedido es "negrita, viñetas y poco más", no un editor completo, y
 * esta app corre siempre sobre el Chromium empaquetado con Electron, donde
 * execCommand sigue funcionando de forma fiable pese a estar obsoleto en
 * la plataforma web abierta.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Escribe aquí...',
  minHeightClassName = 'min-h-[120px]',
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  // Sincroniza el DOM solo cuando `value` cambia por una vía externa
  // (p. ej. al abrir el modal, o al llegar una recarga por polling) — nunca
  // en cada pulsación, para no perder la posición del cursor mientras se
  // escribe.
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== value) {
      editor.innerHTML = value;
    }
  }, [value]);

  function emitChange() {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }

  function applyCommand(command: string) {
    editorRef.current?.focus();
    document.execCommand(command);
    emitChange();
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text/html') || event.clipboardData.getData('text/plain');
    const sanitized = sanitizeRichText(pasted);
    document.execCommand('insertHTML', false, sanitized);
    emitChange();
  }

  const isEmpty = value.trim().length === 0;

  return (
    <div className="overflow-hidden rounded-lg border border-metro-border bg-metro-surface">
      <div className="flex items-center gap-1 border-b border-metro-border bg-metro-panel/60 px-2 py-1">
        <ToolbarButton icon={Bold} label="Negrita" onClick={() => applyCommand('bold')} />
        <ToolbarButton icon={Italic} label="Cursiva" onClick={() => applyCommand('italic')} />
        <ToolbarButton icon={List} label="Lista con viñetas" onClick={() => applyCommand('insertUnorderedList')} />
        <ToolbarButton
          icon={ListOrdered}
          label="Lista numerada"
          onClick={() => applyCommand('insertOrderedList')}
        />
      </div>
      <div className="relative">
        {isEmpty && (
          <span className="pointer-events-none absolute left-3 top-2 text-sm text-metro-muted">{placeholder}</span>
        )}
        <div
          aria-label={placeholder}
          className={`${minHeightClassName} px-3 py-2 text-sm text-metro-text outline-none [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc`}
          contentEditable
          onBlur={emitChange}
          onInput={emitChange}
          onPaste={handlePaste}
          ref={editorRef}
          role="textbox"
          suppressContentEditableWarning
        />
      </div>
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Bold;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-metro-muted transition hover:bg-metro-surface hover:text-metro-text"
      data-tip={label}
      // Evita que el botón robe el foco del contentEditable antes de aplicar el comando.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon size={14} />
    </button>
  );
}
