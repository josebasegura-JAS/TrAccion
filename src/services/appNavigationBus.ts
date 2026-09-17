import type { AppView } from '../navigation/navigation';

export interface AppNavigationBusTarget {
  view: AppView;
  recordId?: string;
}

const APP_NAVIGATION_EVENT = 'traccion:app-navigation';

export function navigateInApp(target: AppNavigationBusTarget): void {
  window.dispatchEvent(
    new CustomEvent<AppNavigationBusTarget>(APP_NAVIGATION_EVENT, {
      detail: target,
    }),
  );
}

export function subscribeToAppNavigation(
  listener: (target: AppNavigationBusTarget) => void,
): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<AppNavigationBusTarget>;
    const target = customEvent.detail;
    if (!target?.view) return;
    listener(target);
  };

  window.addEventListener(APP_NAVIGATION_EVENT, handler);
  return () => window.removeEventListener(APP_NAVIGATION_EVENT, handler);
}
