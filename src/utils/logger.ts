/**
 * Logger for VisioMCP
 *
 * CRITICAL: Never write to stdout. stdout is reserved for MCP stdio protocol.
 * All logs go to %LOCALAPPDATA%\VisioMCP\logs\
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private logDir: string;
  private logFile: string;
  private level: LogLevel;
  private stream: fs.WriteStream | null = null;

  constructor() {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    this.logDir = path.join(localAppData, 'VisioMCP', 'logs');
    const date = new Date().toISOString().split('T')[0];
    this.logFile = path.join(this.logDir, `visiomcp-${date}.log`);
    this.level = 'info';
    this.initLogDir();
  }

  private initLogDir(): void {
    try {
      fs.mkdirSync(this.logDir, { recursive: true });
      this.stream = fs.createWriteStream(this.logFile, { flags: 'a' });
    } catch {
      // If we can't create the log directory, fall back to stderr only.
      // Never use stdout.
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private format(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const upper = level.toUpperCase().padEnd(5);
    let line = `[${timestamp}] ${upper} ${message}`;
    if (data !== undefined) {
      try {
        line += ' ' + JSON.stringify(data);
      } catch {
        line += ' [unserializable data]';
      }
    }
    return line;
  }

  private write(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;
    const line = this.format(level, message, data);

    // Write to file
    if (this.stream) {
      this.stream.write(line + '\n');
    }

    // Write errors/warnings to stderr only (never stdout)
    if (level === 'error' || level === 'warn') {
      process.stderr.write(line + '\n');
    }
  }

  debug(message: string, data?: unknown): void {
    this.write('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.write('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.write('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.write('error', message, data);
  }

  close(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }
}

// Singleton logger instance
export const logger = new Logger();
