import { createContext } from 'react';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export type ToastOptions = {
  durationMs?: number;
  title?: string;
};

export type ToastItem = {
  id: number;
  message: string;
  options?: ToastOptions;
  tone: ToastTone;
};

export type ToastApi = {
  dismiss: (id: number) => void;
  error: (message: string, options?: ToastOptions) => number;
  info: (message: string, options?: ToastOptions) => number;
  success: (message: string, options?: ToastOptions) => number;
  warning: (message: string, options?: ToastOptions) => number;
};

export const ToastContext = createContext<ToastApi | null>(null);
