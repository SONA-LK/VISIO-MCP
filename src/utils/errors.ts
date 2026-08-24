/**
 * Structured error types for VisioMCP
 * All errors returned to MCP clients must be human-readable and categorized.
 */

export type ErrorCode =
  | 'VISIO_NOT_INSTALLED'
  | 'VISIO_NOT_RUNNING'
  | 'VISIO_CANNOT_START'
  | 'VISIO_COM_FAILURE'
  | 'VISIO_COM_TIMEOUT'
  | 'VISIO_ALREADY_CLOSED'
  | 'DOCUMENT_NOT_FOUND'
  | 'DOCUMENT_NOT_OPEN'
  | 'DOCUMENT_LOCKED'
  | 'DOCUMENT_SAVE_FAILURE'
  | 'INVALID_FILE_PATH'
  | 'INVALID_SHAPE_ID'
  | 'INVALID_PAGE_INDEX'
  | 'INVALID_INPUT'
  | 'SHAPE_NOT_FOUND'
  | 'PAGE_NOT_FOUND'
  | 'UNSUPPORTED_OPERATION'
  | 'FILE_ALREADY_EXISTS'
  | 'EXPORT_FAILURE'
  | 'UNKNOWN';

export class VisioMCPError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: string;
  public readonly recoverable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    details?: string,
    recoverable = false,
  ) {
    super(message);
    this.name = 'VisioMCPError';
    this.code = code;
    this.details = details;
    this.recoverable = recoverable;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: true,
      code: this.code,
      message: this.message,
      details: this.details,
      recoverable: this.recoverable,
    };
  }

  toString(): string {
    let msg = `[${this.code}] ${this.message}`;
    if (this.details) {
      msg += ` — ${this.details}`;
    }
    return msg;
  }
}

// Convenience constructors

export function visioNotInstalled(): VisioMCPError {
  return new VisioMCPError(
    'VISIO_NOT_INSTALLED',
    'Microsoft Visio does not appear to be installed on this machine.',
    'Install Microsoft Visio and try again. Set the "visioPath" config option if Visio is in a non-standard location.',
    false,
  );
}

export function visioNotRunning(): VisioMCPError {
  return new VisioMCPError(
    'VISIO_NOT_RUNNING',
    'Visio is not currently running.',
    'Use the open_visio tool to start Visio first.',
    true,
  );
}

export function visioCannotStart(detail: string): VisioMCPError {
  return new VisioMCPError(
    'VISIO_CANNOT_START',
    'Failed to start Microsoft Visio.',
    detail,
    false,
  );
}

export function visioComFailure(detail: string): VisioMCPError {
  return new VisioMCPError(
    'VISIO_COM_FAILURE',
    'COM automation error communicating with Visio.',
    detail,
    true,
  );
}

export function documentNotOpen(): VisioMCPError {
  return new VisioMCPError(
    'DOCUMENT_NOT_OPEN',
    'No document is currently open in Visio.',
    'Use create_document or open_document first.',
    true,
  );
}

export function documentNotFound(filePath: string): VisioMCPError {
  return new VisioMCPError(
    'DOCUMENT_NOT_FOUND',
    `Document not found: ${filePath}`,
    'Check the file path and try again.',
    true,
  );
}

export function invalidFilePath(detail: string): VisioMCPError {
  return new VisioMCPError(
    'INVALID_FILE_PATH',
    `Invalid file path: ${detail}`,
    undefined,
    true,
  );
}

export function invalidShapeId(id: string): VisioMCPError {
  return new VisioMCPError(
    'INVALID_SHAPE_ID',
    `Shape not found: ${id}`,
    'Use get_shapes to list valid shape IDs.',
    true,
  );
}

export function invalidInput(field: string, detail: string): VisioMCPError {
  return new VisioMCPError(
    'INVALID_INPUT',
    `Invalid input for "${field}": ${detail}`,
    undefined,
    true,
  );
}

export function pageNotFound(index: number): VisioMCPError {
  return new VisioMCPError(
    'PAGE_NOT_FOUND',
    `Page index ${index} does not exist.`,
    'Use get_pages to list valid pages.',
    true,
  );
}

export function fileAlreadyExists(filePath: string): VisioMCPError {
  return new VisioMCPError(
    'FILE_ALREADY_EXISTS',
    `File already exists: ${filePath}`,
    'Use overwrite: true to replace the existing file.',
    true,
  );
}

/**
 * Wrap any unknown error into a VisioMCPError for safe MCP return.
 */
export function wrapError(err: unknown, context?: string): VisioMCPError {
  if (err instanceof VisioMCPError) {
    return err;
  }

  const message = err instanceof Error ? err.message : String(err);
  const detail = context ? `${context}: ${message}` : message;

  // Detect common COM error patterns
  if (message.includes('0x80010001') || message.includes('RPC_E_CALL_REJECTED')) {
    return new VisioMCPError('VISIO_COM_TIMEOUT', 'Visio is busy and rejected the request.', detail, true);
  }
  if (message.includes('0x80080005') || message.includes('CO_E_SERVER_EXEC_FAILURE')) {
    return new VisioMCPError('VISIO_CANNOT_START', 'Failed to launch Visio COM server.', detail, false);
  }
  if (message.includes('0x800706BA') || message.includes('RPC server unavailable')) {
    return new VisioMCPError('VISIO_COM_FAILURE', 'Visio COM server is unavailable.', detail, true);
  }

  return new VisioMCPError('UNKNOWN', message, detail, false);
}
