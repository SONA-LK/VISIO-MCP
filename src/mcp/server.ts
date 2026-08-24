/**
 * VisioMCP Server
 *
 * MCP server implementation using the official @modelcontextprotocol/sdk.
 * Transport: stdio (reads from stdin, writes to stdout).
 *
 * CRITICAL: Never write logs to stdout. stdout is the MCP protocol channel.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from '../utils/logger';
import { TOOLS, handleTool } from './tools';

const SERVER_NAME    = 'VisioMCP';
const SERVER_VERSION = '0.1.0';

export async function startServer(): Promise<void> {
  logger.info(`Starting ${SERVER_NAME} v${SERVER_VERSION}`);

  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // ── List Tools ─────────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('ListTools requested');
    return {
      tools: TOOLS.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  // ── Call Tool ──────────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info(`Tool called: ${name}`, { args });

    const result = await handleTool(name, args ?? {});
    logger.debug(`Tool result: ${name}`, { success: result.success });

    // MCP expects content array with text items
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: !result.success,
    };
  });

  // ── Transport ──────────────────────────────────────────────────────────────
  const transport = new StdioServerTransport();

  // Handle clean shutdown
  process.on('SIGINT', () => {
    logger.info('Received SIGINT — shutting down');
    server.close().catch(() => {});
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM — shutting down');
    server.close().catch(() => {});
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    // Don't exit — try to keep serving
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
  });

  logger.info('Connecting MCP stdio transport');
  await server.connect(transport);
  logger.info(`${SERVER_NAME} ready — listening on stdio`);
}
