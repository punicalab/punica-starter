import { toast } from '@punica/components';

/** Shows a short message to the user. */
export const notify = (message: string, color: 'success' | 'error' | 'info' = 'info') => {
  toast(message, { color });
};
