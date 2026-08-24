/**
 * Unit tests for path validation utilities
 */

import * as path from 'path';
import {
  validateVisioFilePath,
  validateExportPath,
  validateSafePath,
  normalizePath,
} from '../../utils/paths';

// On Linux/CI these tests run with POSIX paths; on Windows with win32 paths.
// We test the logic, not platform-specific behaviors.

describe('validateVisioFilePath', () => {
  it('accepts a valid .vsdx path', () => {
    // Use a platform-appropriate absolute path
    const inputPath = path.isAbsolute('/') ?
      '/tmp/test.vsdx' :
      'C:\\test\\diagram.vsdx';
    const result = validateVisioFilePath(inputPath);
    expect(result).toBeTruthy();
    expect(result.toLowerCase()).toContain('.vsdx');
  });

  it('accepts a valid .vsd path', () => {
    const inputPath = path.isAbsolute('/') ?
      '/tmp/test.vsd' :
      'C:\\test\\old.vsd';
    const result = validateVisioFilePath(inputPath);
    expect(result.toLowerCase()).toContain('.vsd');
  });

  it('rejects a .docx file', () => {
    const inputPath = path.isAbsolute('/') ?
      '/tmp/test.docx' :
      'C:\\test\\document.docx';
    expect(() => validateVisioFilePath(inputPath)).toThrow(/extension/i);
  });

  it('rejects a .exe file', () => {
    const inputPath = path.isAbsolute('/') ?
      '/tmp/malicious.exe' :
      'C:\\bad.exe';
    expect(() => validateVisioFilePath(inputPath)).toThrow(/extension/i);
  });

  it('rejects an empty string', () => {
    expect(() => validateVisioFilePath('')).toThrow(/non-empty string/i);
  });

  it('rejects null bytes', () => {
    expect(() => validateVisioFilePath('/tmp/test\0.vsdx')).toThrow(/invalid characters/i);
  });

  it('normalizes relative path to absolute', () => {
    const result = validateVisioFilePath('./test.vsdx');
    expect(path.isAbsolute(result)).toBe(true);
  });
});

describe('validateExportPath', () => {
  it('accepts .png', () => {
    const p = path.resolve('/tmp/out.png');
    const result = validateExportPath(p);
    expect(result.toLowerCase()).toContain('.png');
  });

  it('accepts .pdf', () => {
    const p = path.resolve('/tmp/out.pdf');
    const result = validateExportPath(p);
    expect(result.toLowerCase()).toContain('.pdf');
  });

  it('accepts .svg', () => {
    const p = path.resolve('/tmp/out.svg');
    const result = validateExportPath(p);
    expect(result.toLowerCase()).toContain('.svg');
  });

  it('accepts .emf', () => {
    const p = path.resolve('/tmp/out.emf');
    const result = validateExportPath(p);
    expect(result.toLowerCase()).toContain('.emf');
  });

  it('accepts .vsdx', () => {
    const p = path.resolve('/tmp/out.vsdx');
    const result = validateExportPath(p);
    expect(result.toLowerCase()).toContain('.vsdx');
  });

  it('rejects .bmp', () => {
    expect(() => validateExportPath('/tmp/out.bmp')).toThrow(/extension/i);
  });

  it('rejects .jpg', () => {
    expect(() => validateExportPath('/tmp/out.jpg')).toThrow(/extension/i);
  });
});

describe('validateSafePath', () => {
  it('accepts a clean absolute path', () => {
    const p = path.resolve('/tmp/clean/path');
    expect(() => validateSafePath(p)).not.toThrow();
  });

  it('rejects null bytes', () => {
    expect(() => validateSafePath('/tmp/test\0file')).toThrow(/invalid characters/i);
  });

  it('rejects relative paths', () => {
    expect(() => validateSafePath('relative/path')).toThrow(/absolute/i);
  });
});

describe('normalizePath', () => {
  it('normalizes a path with trailing separator', () => {
    const result = normalizePath('/tmp/test/');
    expect(result).not.toMatch(/[/\\]$/);
  });

  it('rejects empty input', () => {
    expect(() => normalizePath('')).toThrow(/non-empty string/i);
  });

  it('trims whitespace', () => {
    const result = normalizePath('  /tmp/test.vsdx  ');
    expect(result).not.toMatch(/^\s|\s$/);
  });
});
