import { createElement, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppDialog } from '../components/ui/AppDialog';

type AlertOptions = {
  title?: string;
  type?: 'info' | 'warning' | 'error';
};

type ConfirmOptions = {
  cancelLabel?: string;
  confirmLabel?: string;
  danger?: boolean;
  title?: string;
};

type DialogState =
  | {
      message: string;
      mode: 'alert';
      options?: AlertOptions;
    }
  | {
      message: string;
      mode: 'confirm';
      options?: ConfirmOptions;
    };

export function useAppDialog(): {
  alert: (message: string, options?: AlertOptions) => Promise<void>;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  dialogNode: ReactNode;
} {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const closeDialog = useCallback((value: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolver?.(value);
  }, []);

  const alert = useCallback((message: string, options?: AlertOptions) => {
    return new Promise<void>((resolve) => {
      resolverRef.current = () => resolve();
      setDialog({ message, mode: 'alert', options });
    });
  }, []);

  const confirm = useCallback((message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setDialog({ message, mode: 'confirm', options });
    });
  }, []);

  const dialogNode = useMemo(() => {
    if (!dialog) {
      return null;
    }

    if (dialog.mode === 'alert') {
      return createElement(AppDialog, {
        message: dialog.message,
        mode: 'alert',
        onConfirm: () => closeDialog(true),
        title: dialog.options?.title,
        type: dialog.options?.type,
      });
    }

    return createElement(AppDialog, {
      cancelLabel: dialog.options?.cancelLabel,
      confirmLabel: dialog.options?.confirmLabel,
      danger: dialog.options?.danger,
      message: dialog.message,
      mode: 'confirm',
      onCancel: () => closeDialog(false),
      onConfirm: () => closeDialog(true),
      title: dialog.options?.title,
    });
  }, [closeDialog, dialog]);

  return { alert, confirm, dialogNode };
}
