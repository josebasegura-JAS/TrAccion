import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type ModalStackEntry = {
  id: symbol;
  containerRef: RefObject<HTMLElement | null>;
};

const modalStack: ModalStackEntry[] = [];

function getTopModal(): ModalStackEntry | undefined {
  const connectedEntries = modalStack.filter((entry) => entry.containerRef.current?.isConnected);
  let topModal: ModalStackEntry | undefined;

  for (const entry of connectedEntries) {
    if (!topModal) {
      topModal = entry;
      continue;
    }

    const currentContainer = entry.containerRef.current;
    const topContainer = topModal.containerRef.current;
    if (!currentContainer || !topContainer) {
      continue;
    }

    if (topContainer.contains(currentContainer)) {
      topModal = entry;
      continue;
    }

    if (!currentContainer.contains(topContainer)) {
      topModal = entry;
    }
  }

  return topModal;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    return !element.closest('[aria-hidden="true"], [inert]');
  });
}

/**
 * Encierra el foco dentro del modal superior, gestiona Escape y devuelve el
 * foco al elemento que abrió el diálogo cuando este se desmonta.
 */
export function useModalFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  onEscape: () => void,
): void {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    const modalId = Symbol('modal-focus-trap');
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalStack.push({ id: modalId, containerRef });

    const isTopModal = () => getTopModal()?.id === modalId;

    const focusInitialElement = () => {
      if (!isTopModal()) {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      const autofocusElement = container.querySelector<HTMLElement>('[autofocus]');
      const firstFocusable = autofocusElement ?? getFocusableElements(container)[0] ?? container;
      firstFocusable.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopModal()) {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const focusIsInside = activeElement instanceof Node && container.contains(activeElement);

      if (event.shiftKey) {
        if (!focusIsInside || activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        }
        return;
      }

      if (!focusIsInside || activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    queueMicrotask(focusInitialElement);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const stackIndex = modalStack.findIndex((entry) => entry.id === modalId);
      if (stackIndex >= 0) {
        modalStack.splice(stackIndex, 1);
      }

      if (previouslyFocused?.isConnected) {
        queueMicrotask(() => previouslyFocused.focus());
      }
    };
  }, [containerRef]);
}
