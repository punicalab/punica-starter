// `toast` and `confirm` are exported by @punica/components 2.1 and described
// in its guide, but its type declarations (generated from the custom
// elements) leave them out. Declared here until the package does.
import '@punica/components';

type Color = 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'neutral';

declare module '@punica/components' {
  /** Shows a short message that goes away by itself. */
  export function toast(message: string, options?: { color?: Color; duration?: number }): HTMLElement;

  /** Asks the user to confirm; resolves with whether they did. */
  export function confirm(options?: {
    heading?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    color?: Color;
  }): Promise<boolean>;
}
