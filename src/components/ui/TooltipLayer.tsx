import { useEffect, useRef } from 'react';

const SHOW_DELAY_MS = 150;
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;

/**
 * Capa global de tooltips rápidos. Cualquier elemento con `data-tip="Texto"`
 * muestra al pasar el ratón (o al recibir foco de teclado) una burbuja
 * inmediata, sin el retardo del tooltip nativo del navegador.
 *
 * - Usa delegación de eventos a nivel de documento: los componentes solo
 *   añaden el atributo `data-tip`, sin envolver nada.
 * - Posición `fixed`, así no lo recortan contenedores con overflow (tablas,
 *   modales con scroll...).
 * - Por defecto aparece encima del elemento; si no hay hueco, salta abajo.
 * - `data-tip` no sustituye a `aria-label`: los botones de solo icono deben
 *   seguir llevando su etiqueta accesible.
 */
export function TooltipLayer() {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const currentAnchorRef = useRef<Element | null>(null);

  useEffect(() => {
    const tooltip = tooltipRef.current;
    if (!tooltip) {
      return;
    }

    const clearShowTimer = () => {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };

    const hide = () => {
      clearShowTimer();
      currentAnchorRef.current = null;
      tooltip.classList.remove('ui-tooltip--visible');
    };

    const position = (anchor: Element) => {
      const rect = anchor.getBoundingClientRect();
      const tipRect = tooltip.getBoundingClientRect();

      let top = rect.top - tipRect.height - ANCHOR_GAP;
      if (top < VIEWPORT_MARGIN) {
        top = rect.bottom + ANCHOR_GAP;
      }

      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      const maxLeft = window.innerWidth - tipRect.width - VIEWPORT_MARGIN;
      left = Math.min(Math.max(left, VIEWPORT_MARGIN), Math.max(maxLeft, VIEWPORT_MARGIN));

      tooltip.style.top = `${Math.round(top)}px`;
      tooltip.style.left = `${Math.round(left)}px`;
    };

    const show = (anchor: Element, text: string) => {
      currentAnchorRef.current = anchor;
      tooltip.textContent = text;
      // Colocar primero fuera de la vista para medir con el texto definitivo.
      tooltip.style.top = '-9999px';
      tooltip.style.left = '-9999px';
      tooltip.classList.add('ui-tooltip--visible');
      position(anchor);
    };

    const scheduleShow = (anchor: Element) => {
      const text = anchor.getAttribute('data-tip')?.trim();
      if (!text) {
        return;
      }
      clearShowTimer();
      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null;
        // El elemento puede haber desaparecido (cierre de modal, re-render...).
        if (anchor.isConnected) {
          show(anchor, text);
        }
      }, SHOW_DELAY_MS);
    };

    const findAnchor = (target: EventTarget | null): Element | null => {
      if (!(target instanceof Element)) {
        return null;
      }
      return target.closest('[data-tip]');
    };

    const handlePointerOver = (event: PointerEvent) => {
      const anchor = findAnchor(event.target);
      if (!anchor) {
        return;
      }
      if (anchor !== currentAnchorRef.current) {
        hide();
        scheduleShow(anchor);
      }
    };

    const handlePointerOut = (event: PointerEvent) => {
      const anchor = findAnchor(event.target);
      if (!anchor) {
        return;
      }
      const next = event.relatedTarget;
      if (next instanceof Element && anchor.contains(next)) {
        return;
      }
      hide();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const anchor = findAnchor(event.target);
      if (anchor) {
        hide();
        scheduleShow(anchor);
      }
    };

    const handleHide = () => hide();

    document.addEventListener('pointerover', handlePointerOver, true);
    document.addEventListener('pointerout', handlePointerOut, true);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleHide, true);
    document.addEventListener('pointerdown', handleHide, true);
    document.addEventListener('keydown', handleHide, true);
    document.addEventListener('scroll', handleHide, true);
    window.addEventListener('resize', handleHide);

    return () => {
      clearShowTimer();
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('pointerout', handlePointerOut, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleHide, true);
      document.removeEventListener('pointerdown', handleHide, true);
      document.removeEventListener('keydown', handleHide, true);
      document.removeEventListener('scroll', handleHide, true);
      window.removeEventListener('resize', handleHide);
    };
  }, []);

  return <div aria-hidden="true" className="ui-tooltip" ref={tooltipRef} />;
}
