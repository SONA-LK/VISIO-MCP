/**
 * Visio Executable Detection
 *
 * Searches common Office installation paths for VISIO.EXE.
 * Never hard-codes a single path. Returns the first found path.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

// All known Office/Visio installation search paths (Windows)
const VISIO_SEARCH_PATHS: string[] = [
  // Microsoft 365 / Office 2021 / 2019 (C2R)
  'C:\\Program Files\\Microsoft Office\\root\\Office16\\VISIO.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\VISIO.EXE',
  // Office 2016
  'C:\\Program Files\\Microsoft Office\\Office16\\VISIO.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\Office16\\VISIO.EXE',
  // Office 2013
  'C:\\Program Files\\Microsoft Office\\Office15\\VISIO.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\Office15\\VISIO.EXE',
  // Office 2010
  'C:\\Program Files\\Microsoft Office\\Office14\\VISIO.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\Office14\\VISIO.EXE',
  // Office 2007
  'C:\\Program Files\\Microsoft Office\\Office12\\VISIO.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\Office12\\VISIO.EXE',
];

/**
 * Detect VISIO.EXE path.
 * Priority:
 *   1. User-configured path (from config)
 *   2. VISIOMCP_VISIO_PATH environment variable
 *   3. Well-known installation paths
 *
 * Returns null if not found.
 */
export function detectVisioPath(configuredPath?: string): string | null {
  // Priority 1: user configuration
  if (configuredPath) {
    if (fs.existsSync(configuredPath)) {
      logger.info('Using configured Visio path', { path: configuredPath });
      return configuredPath;
    }
    logger.warn('Configured Visio path does not exist', { path: configuredPath });
  }

  // Priority 2: environment variable override
  const envPath = process.env.VISIOMCP_VISIO_PATH;
  if (envPath) {
    if (fs.existsSync(envPath)) {
      logger.info('Using Visio path from environment variable', { path: envPath });
      return envPath;
    }
    logger.warn('Environment variable VISIOMCP_VISIO_PATH path does not exist', { path: envPath });
  }

  // Priority 3: scan known locations
  for (const candidate of VISIO_SEARCH_PATHS) {
    if (fs.existsSync(candidate)) {
      logger.info('Auto-detected Visio installation', { path: candidate });
      return candidate;
    }
  }

  // Priority 4: try ProgramFiles env variants
  const programFiles = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.ProgramW6432,
  ].filter(Boolean) as string[];

  for (const pf of programFiles) {
    const candidates = [
      path.join(pf, 'Microsoft Office', 'root', 'Office16', 'VISIO.EXE'),
      path.join(pf, 'Microsoft Office', 'Office16', 'VISIO.EXE'),
      path.join(pf, 'Microsoft Office', 'Office15', 'VISIO.EXE'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        logger.info('Found Visio via ProgramFiles env', { path: candidate });
        return candidate;
      }
    }
  }

  logger.warn('VISIO.EXE not found in any known location');
  return null;
}

/**
 * Check if a path looks like a valid Visio executable.
 */
export function isValidVisioExecutable(exePath: string): boolean {
  try {
    const stat = fs.statSync(exePath);
    if (!stat.isFile()) return false;
    const name = path.basename(exePath).toUpperCase();
    return name === 'VISIO.EXE';
  } catch {
    return false;
  }
}
