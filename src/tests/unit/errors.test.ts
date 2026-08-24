/**
 * Unit tests for error handling utilities
 */

import {
  VisioMCPError,
  visioNotInstalled,
  visioNotRunning,
  visioCannotStart,
  visioComFailure,
  documentNotOpen,
  documentNotFound,
  invalidFilePath,
  invalidShapeId,
  invalidInput,
  pageNotFound,
  fileAlreadyExists,
  wrapError,
} from '../../utils/errors';

describe('VisioMCPError', () => {
  it('has the correct structure', () => {
    const err = new VisioMCPError('VISIO_NOT_RUNNING', 'Test message', 'details', true);
    expect(err.code).toBe('VISIO_NOT_RUNNING');
    expect(err.message).toBe('Test message');
    expect(err.details).toBe('details');
    expect(err.recoverable).toBe(true);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VisioMCPError);
  });

  it('serializes to JSON correctly', () => {
    const err = new VisioMCPError('INVALID_INPUT', 'Bad input', 'field x', true);
    const json = err.toJSON();
    expect(json.error).toBe(true);
    expect(json.code).toBe('INVALID_INPUT');
    expect(json.message).toBe('Bad input');
    expect(json.details).toBe('field x');
    expect(json.recoverable).toBe(true);
  });

  it('toString includes code and message', () => {
    const err = new VisioMCPError('SHAPE_NOT_FOUND', 'Shape missing', 'use get_shapes');
    const str = err.toString();
    expect(str).toContain('SHAPE_NOT_FOUND');
    expect(str).toContain('Shape missing');
  });
});

describe('Error factory functions', () => {
  it('visioNotInstalled returns correct code', () => {
    const err = visioNotInstalled();
    expect(err.code).toBe('VISIO_NOT_INSTALLED');
    expect(err.recoverable).toBe(false);
  });

  it('visioNotRunning is recoverable', () => {
    const err = visioNotRunning();
    expect(err.code).toBe('VISIO_NOT_RUNNING');
    expect(err.recoverable).toBe(true);
  });

  it('visioCannotStart includes detail', () => {
    const err = visioCannotStart('COM server failed');
    expect(err.code).toBe('VISIO_CANNOT_START');
    expect(err.details).toContain('COM server failed');
  });

  it('documentNotFound includes path', () => {
    const err = documentNotFound('C:\\test.vsdx');
    expect(err.code).toBe('DOCUMENT_NOT_FOUND');
    expect(err.message).toContain('C:\\test.vsdx');
  });

  it('invalidShapeId includes id', () => {
    const err = invalidShapeId('Sheet.999');
    expect(err.code).toBe('INVALID_SHAPE_ID');
    expect(err.message).toContain('Sheet.999');
  });

  it('pageNotFound includes index', () => {
    const err = pageNotFound(5);
    expect(err.code).toBe('PAGE_NOT_FOUND');
    expect(err.message).toContain('5');
  });

  it('fileAlreadyExists includes path', () => {
    const err = fileAlreadyExists('C:\\out.vsdx');
    expect(err.code).toBe('FILE_ALREADY_EXISTS');
    expect(err.message).toContain('C:\\out.vsdx');
  });
});

describe('wrapError', () => {
  it('passes through VisioMCPError unchanged', () => {
    const original = visioNotRunning();
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it('wraps a plain Error', () => {
    const err = new Error('Something went wrong');
    const wrapped = wrapError(err);
    expect(wrapped).toBeInstanceOf(VisioMCPError);
    expect(wrapped.code).toBe('UNKNOWN');
    expect(wrapped.message).toBe('Something went wrong');
  });

  it('wraps a string error', () => {
    const wrapped = wrapError('String error message');
    expect(wrapped).toBeInstanceOf(VisioMCPError);
    expect(wrapped.code).toBe('UNKNOWN');
  });

  it('detects COM RPC_REJECTED pattern', () => {
    const err = new Error('COM Error: 0x80010001 RPC_E_CALL_REJECTED');
    const wrapped = wrapError(err);
    expect(wrapped.code).toBe('VISIO_COM_TIMEOUT');
  });

  it('detects COM server exec failure', () => {
    const err = new Error('Error 0x80080005: CO_E_SERVER_EXEC_FAILURE');
    const wrapped = wrapError(err);
    expect(wrapped.code).toBe('VISIO_CANNOT_START');
  });

  it('includes context in details', () => {
    const err = new Error('Something failed');
    const wrapped = wrapError(err, 'myOperation');
    expect(wrapped.details).toContain('myOperation');
  });
});
