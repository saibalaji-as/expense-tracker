/** Errors the model can explain to the user. `code` is stable; `message` is user-facing. */
export type McpErrorCode =
  | 'NOT_PRO'
  | 'DRIVE_ACCESS_REVOKED'
  | 'NO_BACKUP'
  | 'NOT_A_MEMBER'
  | 'INVALID_ARGUMENT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR';

export class McpToolError extends Error {
  constructor(public readonly code: McpErrorCode, message: string) {
    super(message);
    this.name = 'McpToolError';
  }
}

export const notPro = (): McpToolError =>
  new McpToolError('NOT_PRO', 'Spenza for Claude is a Pro feature. Upgrade to Spenza Pro in the app to use it.');
