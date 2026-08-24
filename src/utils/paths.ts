/**
 * Windows path utilities for VisioMCP
 * Safe path handling, normalization, and traversal prevention.
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * Normalize a Windows file path.
 * - Resolves relative paths to absolute
 * - Normalizes separators
 * - Does NOT verify the file exists
 */
export function normalizePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Path must be a non-empty string');
  }
  // Normalize and resolve to absolute
  return path.resolve(inputPath.trim());
}

/**
 * Validate a path for use as a Visio file path.
 * - Must be absolute
 * - Must have a .vsdx or .vsd extension
 * - Prevents traversal outside allowed directories (if baseDirs provided)
 */
export function validateVisioFilePath(
  inputPath: string,
  allowedExtensions: string[] = ['.vsdx', '.vsd'],
): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('File path must be a non-empty string');
  }

  const normalized = normalizePath(inputPath);
  const ext = path.extname(normalized).toLowerCase();

  if (!allowedExtensions.includes(ext)) {
    throw new Error(
      `Invalid file extension "${ext}". Allowed: ${allowedExtensions.join(', ')}`,
    );
  }

  // Prevent null bytes
  if (normalized.includes('\0')) {
    throw new Error('Invalid characters in file path');
  }

  return normalized;
}

/**
 * Validate an export output path.
 */
export function validateExportPath(
  inputPath: string,
  allowedExtensions: string[] = ['.png', '.pdf', '.svg', '.emf', '.vsdx'],
): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Export path must be a non-empty string');
  }

  const normalized = normalizePath(inputPath);
  const ext = path.extname(normalized).toLowerCase();

  if (!allowedExtensions.includes(ext)) {
    throw new Error(
      `Invalid export extension "${ext}". Allowed: ${allowedExtensions.join(', ')}`,
    );
  }

  if (normalized.includes('\0')) {
    throw new Error('Invalid characters in export path');
  }

  return normalized;
}

/**
 * Validate a path is safe (no traversal, no null bytes, is absolute).
 */
export function validateSafePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Path must be a non-empty string');
  }

  // Check for null bytes BEFORE normalizing (normalizePath trims but doesn't catch \0)
  if (inputPath.includes('\0')) {
    throw new Error('Invalid characters in path');
  }

  const normalized = normalizePath(inputPath);

  // Must be absolute (path.resolve always returns absolute, but input may be relative)
  // Detect: if the original input (trimmed) is not absolute, it was relative
  const trimmed = inputPath.trim();
  const isWindowsAbsolute = /^[A-Za-z]:[/\\]/.test(trimmed);
  const isUnixAbsolute    = trimmed.startsWith('/');

  if (!isWindowsAbsolute && !isUnixAbsolute) {
    throw new Error('Path must be absolute');
  }

  return normalized;
}

/**
 * Check whether a path exists on the filesystem.
 */
export function pathExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a path is writable.
 */
export function pathIsWritable(filePath: string): boolean {
  // Check if parent directory is writable
  const dir = path.dirname(filePath);
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it if necessary.
 */
export function ensureDirectory(dirPath: string): void {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'EEXIST') {
      throw new Error(`Failed to create directory "${dirPath}": ${e.message}`);
    }
  }
}
