#!/usr/bin/env node
/**
 * VisioMCP — Entry Point
 *
 * MCP server that controls Microsoft Visio via Windows COM automation.
 * Transport: stdio
 * Platform: Windows only
 */

import { logger } from './utils/logger';
import { getConfig } from './config/config';
import { startServer } from './mcp/server';

async function main(): Promise<void> {
  // Load and apply configuration
  const config = getConfig();
  logger.setLevel(config.logLevel);

  logger.info('VisioMCP starting', {
    platform: process.platform,
    nodeVersion: process.version,
    pid: process.pid,
  });

  if (process.platform !== 'win32') {
    // We still start (useful for CI schema validation), but warn loudly
    logger.warn('VisioMCP is designed for Windows only. COM automation will not work on this platform.');
  }

  await startServer();
}

main().catch((err) => {
  // Last-resort error: write to stderr only, never stdout
  process.stderr.write(`VisioMCP fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
