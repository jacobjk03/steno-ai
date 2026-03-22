/**
 * Error thrown by the Steno SDK when the API returns a non-OK response.
 */
export class StenoError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'StenoError';
    this.code = code;
    this.status = status;
  }
}
