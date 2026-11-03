export class BridgeResponseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BridgeResponseError';
    this.code = code;
  }
}
