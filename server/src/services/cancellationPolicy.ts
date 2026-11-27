/**
 * F-07 cancellation rule (BR-13, feature SDS D-1): a customer may cancel only a `WAITING` entry.
 * `CALLED` (no-show, F-08), `SERVING` (operator action), `COMPLETED` and `CANCELLED` (terminal) are not
 * cancellable. Any unknown status is treated as not cancellable.
 */
export function isCustomerCancellable(status: string): boolean {
  return status === 'WAITING';
}
