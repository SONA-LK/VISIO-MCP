/**
 * Unit tests for configuration management
 */

import { loadConfig } from '../../config/config';

describe('loadConfig', () => {
  it('returns a valid config object with defaults when config file is missing', () => {
    // This test runs in CI where no config file exists — should use defaults
    const config = loadConfig();

    expect(config).toBeDefined();
    expect(typeof config.autoStartVisio).toBe('boolean');
    expect(typeof config.confirmDestructiveActions).toBe('boolean');
    expect(typeof config.logLevel).toBe('string');
    expect(typeof config.comTimeoutMs).toBe('number');
    expect(typeof config.allowSilentOverwrite).toBe('boolean');
  });

  it('has correct default values', () => {
    const config = loadConfig();

    // These are the documented defaults
    expect(config.autoStartVisio).toBe(true);
    expect(config.confirmDestructiveActions).toBe(false);
    expect(config.logLevel).toBe('info');
    expect(config.comTimeoutMs).toBe(30000);
    expect(config.allowSilentOverwrite).toBe(false);
  });

  it('visioPath defaults to undefined', () => {
    const config = loadConfig();
    expect(config.visioPath).toBeUndefined();
  });

  it('logLevel is one of the valid levels', () => {
    const config = loadConfig();
    const validLevels = ['debug', 'info', 'warn', 'error'];
    expect(validLevels).toContain(config.logLevel);
  });
});
