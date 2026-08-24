/**
 * VisioMCP Configuration
 *
 * Config file lives at: %LOCALAPPDATA%\VisioMCP\config.json
 * Never hard-codes a single Visio path. Always detects or falls back.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LogLevel } from '../utils/logger';

export interface VisioMCPConfig {
  /** Override path to VISIO.EXE. Auto-detected if not set. */
  visioPath?: string;
  /** Automatically start Visio if not running (default: true) */
  autoStartVisio: boolean;
  /** Whether destructive operations require confirmation via parameter (default: false for now) */
  confirmDestructiveActions: boolean;
  /** Log level: debug | info | warn | error (default: info) */
  logLevel: LogLevel;
  /** COM operation timeout in milliseconds (default: 30000) */
  comTimeoutMs: number;
  /** Whether to allow overwriting existing files silently (default: false) */
  allowSilentOverwrite: boolean;
}

const DEFAULT_CONFIG: VisioMCPConfig = {
  visioPath: undefined,
  autoStartVisio: true,
  confirmDestructiveActions: false,
  logLevel: 'info',
  comTimeoutMs: 30000,
  allowSilentOverwrite: false,
};

function getConfigDir(): string {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'VisioMCP');
}

function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

export function loadConfig(): VisioMCPConfig {
  const configPath = getConfigPath();

  try {
    if (!fs.existsSync(configPath)) {
      return { ...DEFAULT_CONFIG };
    }

    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<VisioMCPConfig>;

    // Merge with defaults — user config overrides only what they set
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
  } catch {
    // On any parse/read failure, use defaults
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: VisioMCPConfig): void {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function getConfigDirPath(): string {
  return getConfigDir();
}

// Global config singleton
let _config: VisioMCPConfig | null = null;

export function getConfig(): VisioMCPConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

export function reloadConfig(): VisioMCPConfig {
  _config = loadConfig();
  return _config;
}
