/**
 * MCP Tool implementations for VisioMCP.
 *
 * Each tool:
 *   1. Validates input with Zod
 *   2. Calls the Visio abstraction layer
 *   3. Returns structured JSON result
 *   4. Catches and formats all errors for the AI client
 *
 * NEVER expose COM objects here. Only return plain JSON-serializable data.
 */

import { ZodSchema } from 'zod';
import { logger } from '../utils/logger';
import { wrapError } from '../utils/errors';
import { visioApp } from '../visio/application';
import { visioDocument } from '../visio/document';
import { visioShapes } from '../visio/shapes';
import { visioConnectors } from '../visio/connectors';
import { validateVisioFilePath } from '../utils/paths';
import { AddShapeInput } from '../models/shape';
import { DIAGRAM_TOOL_DEFS, handleDiagramTool } from './diagramTools';

import {
  GetVisioStatusSchema,
  OpenVisioSchema,
  CreateDocumentSchema,
  OpenDocumentSchema,
  SaveDocumentSchema,
  CloseDocumentSchema,
  GetDocumentInfoSchema,
  GetPagesSchema,
  CreatePageSchema,
  AddShapeSchema,
  SetShapeTextSchema,
  MoveShapeSchema,
  ResizeShapeSchema,
  DeleteShapeSchema,
  ConnectShapesSchema,
  GetShapesSchema,
  GetSelectionSchema,
  ExportDocumentSchema,
  GetConnectionsSchema,
} from './schemas';

// ── Result types ───────────────────────────────────────────────────────────────

interface ToolSuccess {
  success: true;
  [key: string]: unknown;
}

interface ToolError {
  success: false;
  error: string;
  code: string;
  details?: string;
  recoverable: boolean;
}

type ToolResult = ToolSuccess | ToolError;

function ok(data: Record<string, unknown>): ToolResult {
  return { success: true, ...data };
}

function fail(err: unknown): ToolResult {
  const wrapped = wrapError(err);
  logger.error('Tool error', { code: wrapped.code, message: wrapped.message, details: wrapped.details });
  return {
    success:     false,
    error:       wrapped.message,
    code:        wrapped.code,
    details:     wrapped.details,
    recoverable: wrapped.recoverable,
  };
}

function validate<T>(schema: ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `${i.path.join('.') || 'input'}: ${i.message}`)
      .join('; ');
    throw wrapError(new Error(`Validation failed — ${issues}`));
  }
  return result.data;
}

// ── Tool Definitions (registered with MCP) ────────────────────────────────────

export const TOOLS = [
  {
    name: 'get_visio_status',
    description: 'Check whether Microsoft Visio is running and return version and open document info.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'open_visio',
    description: 'Start Microsoft Visio. Auto-detects the installation. Does nothing if already running.',
    inputSchema: {
      type: 'object',
      properties: {
        visioPath: { type: 'string', description: 'Optional explicit path to VISIO.EXE.' },
      },
      required: [],
    },
  },
  {
    name: 'create_document',
    description: 'Create a new blank Visio drawing document.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'open_document',
    description: 'Open an existing Visio file (.vsdx or .vsd).',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute path to the .vsdx or .vsd file.' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'save_document',
    description: 'Save the active Visio document. Optionally save to a new path.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath:  { type: 'string',  description: 'Save to this path. Omit to save in place.' },
        overwrite: { type: 'boolean', description: 'Overwrite existing file. Default: false.' },
      },
      required: [],
    },
  },
  {
    name: 'close_document',
    description: 'Close the active Visio document.',
    inputSchema: {
      type: 'object',
      properties: {
        save: { type: 'boolean', description: 'Save before closing. Default: false.' },
      },
      required: [],
    },
  },
  {
    name: 'get_document_info',
    description: 'Get name, path, page count and save status of the active document.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_pages',
    description: 'List all pages in the active Visio document with name, size, and shape count.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_page',
    description: 'Add a new page to the active Visio document.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the new page.' },
      },
      required: [],
    },
  },
  {
    name: 'add_shape',
    description: 'Add a shape to a Visio page. Coordinates are in inches from the top-left corner.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: [
            'rectangle','rounded-rectangle','ellipse','diamond','triangle',
            'line','text','server','database','router','switch','firewall',
            'computer','cloud','process','decision','document','start-end',
          ],
          description: 'Shape type.',
        },
        x:         { type: 'number',  description: 'X position in inches from left edge.' },
        y:         { type: 'number',  description: 'Y position in inches from top edge.' },
        width:     { type: 'number',  description: 'Width in inches (optional, has sensible default).' },
        height:    { type: 'number',  description: 'Height in inches (optional, has sensible default).' },
        text:      { type: 'string',  description: 'Text label for the shape.' },
        pageIndex: { type: 'integer', description: '0-based page index. Default: first page.' },
        style: {
          type: 'object',
          properties: {
            fillColor:  { type: 'string',  description: 'Fill color as hex e.g. "#4472C4".' },
            lineColor:  { type: 'string',  description: 'Border color as hex.' },
            lineWeight: { type: 'number',  description: 'Border weight in points.' },
            fontColor:  { type: 'string',  description: 'Text color as hex.' },
            fontSize:   { type: 'number',  description: 'Font size in points.' },
            fontBold:   { type: 'boolean' },
            fontItalic: { type: 'boolean' },
          },
        },
      },
      required: ['type', 'x', 'y'],
    },
  },
  {
    name: 'set_shape_text',
    description: 'Set or replace the text label of a shape.',
    inputSchema: {
      type: 'object',
      properties: {
        shapeId:   { type: 'string',  description: 'Shape ID, e.g. "Sheet.5".' },
        text:      { type: 'string',  description: 'New text content.' },
        pageIndex: { type: 'integer', description: '0-based page index. Default: first page.' },
      },
      required: ['shapeId', 'text'],
    },
  },
  {
    name: 'move_shape',
    description: 'Move a shape to a new position (top-left coordinates in inches).',
    inputSchema: {
      type: 'object',
      properties: {
        shapeId:   { type: 'string',  description: 'Shape ID, e.g. "Sheet.5".' },
        x:         { type: 'number',  description: 'New X in inches from left edge.' },
        y:         { type: 'number',  description: 'New Y in inches from top edge.' },
        pageIndex: { type: 'integer', description: '0-based page index.' },
      },
      required: ['shapeId', 'x', 'y'],
    },
  },
  {
    name: 'resize_shape',
    description: 'Resize a shape to new dimensions.',
    inputSchema: {
      type: 'object',
      properties: {
        shapeId:   { type: 'string',  description: 'Shape ID, e.g. "Sheet.5".' },
        width:     { type: 'number',  description: 'New width in inches.' },
        height:    { type: 'number',  description: 'New height in inches.' },
        pageIndex: { type: 'integer', description: '0-based page index.' },
      },
      required: ['shapeId', 'width', 'height'],
    },
  },
  {
    name: 'delete_shape',
    description: 'Permanently delete a shape from the page.',
    inputSchema: {
      type: 'object',
      properties: {
        shapeId:   { type: 'string',  description: 'Shape ID to delete, e.g. "Sheet.5".' },
        pageIndex: { type: 'integer', description: '0-based page index.' },
      },
      required: ['shapeId'],
    },
  },
  {
    name: 'connect_shapes',
    description: 'Draw a connector (arrow) between two shapes.',
    inputSchema: {
      type: 'object',
      properties: {
        fromShapeId: { type: 'string',  description: 'Source shape ID.' },
        toShapeId:   { type: 'string',  description: 'Target shape ID.' },
        text:        { type: 'string',  description: 'Optional connector label.' },
        pageIndex:   { type: 'integer', description: '0-based page index.' },
      },
      required: ['fromShapeId', 'toShapeId'],
    },
  },
  {
    name: 'get_shapes',
    description: 'List all shapes on a page with their IDs, positions, sizes, and text content.',
    inputSchema: {
      type: 'object',
      properties: {
        pageIndex: { type: 'integer', description: '0-based page index. Default: first page.' },
      },
      required: [],
    },
  },
  {
    name: 'get_selection',
    description: 'Get the shapes currently selected in the active Visio window.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_connections',
    description: 'List all connectors on a page, showing which shapes they connect.',
    inputSchema: {
      type: 'object',
      properties: {
        pageIndex: { type: 'integer', description: '0-based page index. Default: first page.' },
      },
      required: [],
    },
  },
  {
    name: 'export_document',
    description: 'Export the Visio document or a page to PNG, PDF, SVG, EMF, or VSDX.',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath: { type: 'string', description: 'Absolute path for the output file.' },
        format: {
          type: 'string',
          enum: ['png', 'pdf', 'svg', 'emf', 'vsdx'],
          description: 'Export format. Must match file extension.',
        },
        pageIndex: { type: 'integer', description: '0-based page index. Omit to export all (PDF only).' },
      },
      required: ['outputPath', 'format'],
    },
  },
  ...DIAGRAM_TOOL_DEFS,
] as const;

// ── Tool Handlers ──────────────────────────────────────────────────────────────

export async function handleTool(
  toolName: string,
  rawInput: unknown,
): Promise<ToolResult> {
  logger.info(`Tool: ${toolName}`);

  try {
    switch (toolName) {

      // ── Status / Lifecycle ──────────────────────────────────────────────────

      case 'get_visio_status': {
        validate(GetVisioStatusSchema, rawInput);
        const running = visioApp.isRunning();
        if (!running) {
          return ok({ running: false, message: 'Visio is not running. Use open_visio to start it.' });
        }
        await visioApp.ensureConnected();
        const version   = visioApp.getVersion();
        const visioPath = visioApp.getApplicationPath();
        const docCount  = visioApp.getDocumentCount();
        let activeDocument: string | undefined;
        try { activeDocument = (await visioDocument.getInfo()).name; } catch { /* no doc open */ }
        return ok({ running: true, version, visioPath, documentCount: docCount, activeDocument });
      }

      case 'open_visio': {
        validate(OpenVisioSchema, rawInput);
        await visioApp.connect();
        return ok({ message: 'Visio is running.', version: visioApp.getVersion() });
      }

      // ── Document ────────────────────────────────────────────────────────────

      case 'create_document': {
        validate(CreateDocumentSchema, rawInput);
        await visioApp.ensureConnected();
        const info = await visioDocument.create();
        return ok({ message: 'New blank document created.', document: info });
      }

      case 'open_document': {
        const input      = validate(OpenDocumentSchema, rawInput);
        // Single path validation — document.open() also validates internally
        const normalized = validateVisioFilePath(input.filePath);
        const info       = await visioDocument.open(normalized);
        return ok({ message: `Opened: ${info.name}`, document: info });
      }

      case 'save_document': {
        const input = validate(SaveDocumentSchema, rawInput);
        if (input.filePath) {
          const normalized = validateVisioFilePath(input.filePath);
          await visioDocument.saveAs(normalized, input.overwrite ?? false);
          return ok({ message: `Saved to ${normalized}.` });
        }
        await visioDocument.save();
        return ok({ message: 'Document saved.' });
      }

      case 'close_document': {
        const input = validate(CloseDocumentSchema, rawInput);
        await visioDocument.close(input.save ?? false);
        return ok({ message: 'Document closed.' });
      }

      case 'get_document_info': {
        validate(GetDocumentInfoSchema, rawInput);
        const info = await visioDocument.getInfo();
        return ok({ document: info });
      }

      // ── Pages ───────────────────────────────────────────────────────────────

      case 'get_pages': {
        validate(GetPagesSchema, rawInput);
        const pages = await visioDocument.getPages();
        return ok({ pages, pageCount: pages.length });
      }

      case 'create_page': {
        const input = validate(CreatePageSchema, rawInput);
        const page  = await visioDocument.createPage(input.name);
        return ok({ message: `Page "${page.name}" created at index ${page.index}.`, page });
      }

      // ── Shapes ──────────────────────────────────────────────────────────────

      case 'add_shape': {
        const input  = validate(AddShapeSchema, rawInput);
        await visioApp.ensureConnected();
        const result = await visioShapes.addShape(input as AddShapeInput);
        return ok({
          message: `Added ${input.type} shape.`,
          shape:   result,
          hint:    `Use shapeId "${result.shapeId}" to move, resize, connect, or delete this shape.`,
        });
      }

      case 'set_shape_text': {
        const input = validate(SetShapeTextSchema, rawInput);
        await visioShapes.setShapeText(input.shapeId, input.text, input.pageIndex);
        return ok({ message: `Text updated on ${input.shapeId}.` });
      }

      case 'move_shape': {
        const input = validate(MoveShapeSchema, rawInput);
        await visioShapes.moveShape(input.shapeId, input.x, input.y, input.pageIndex);
        return ok({ message: `${input.shapeId} moved to (${input.x}in, ${input.y}in).` });
      }

      case 'resize_shape': {
        const input = validate(ResizeShapeSchema, rawInput);
        await visioShapes.resizeShape(input.shapeId, input.width, input.height, input.pageIndex);
        return ok({ message: `${input.shapeId} resized to ${input.width}×${input.height} inches.` });
      }

      case 'delete_shape': {
        const input = validate(DeleteShapeSchema, rawInput);
        await visioShapes.deleteShape(input.shapeId, input.pageIndex);
        return ok({ message: `Shape ${input.shapeId} deleted.` });
      }

      case 'get_shapes': {
        const input  = validate(GetShapesSchema, rawInput);
        const shapes = await visioShapes.getShapes(input.pageIndex);
        return ok({ shapes, shapeCount: shapes.length });
      }

      case 'get_selection': {
        validate(GetSelectionSchema, rawInput);
        const shapes = await visioShapes.getSelection();
        return ok({ selectedShapes: shapes, count: shapes.length });
      }

      // ── Connectors ──────────────────────────────────────────────────────────

      case 'connect_shapes': {
        const input  = validate(ConnectShapesSchema, rawInput);
        const result = await visioConnectors.connectShapes(input);
        return ok({
          message:   `Connected ${input.fromShapeId} → ${input.toShapeId}.`,
          connector: result,
        });
      }

      case 'get_connections': {
        const input       = validate(GetConnectionsSchema, rawInput);
        const connections = await visioConnectors.getConnections(input.pageIndex);
        return ok({ connections, count: connections.length });
      }

      // ── Export ──────────────────────────────────────────────────────────────

      case 'export_document': {
        const input = validate(ExportDocumentSchema, rawInput);
        await visioDocument.export({
          format:     input.format,
          outputPath: input.outputPath,
          pageIndex:  input.pageIndex,
        });
        return ok({ message: `Exported to ${input.outputPath}.` });
      }

      // ── Diagram generation (analyze -> plan -> design) ─────────────────────

      default: {
        const diagramResult = await handleDiagramTool(toolName, rawInput);
        if (diagramResult !== null) return ok(diagramResult);
        return fail(new Error(`Unknown tool: "${toolName}"`));
      }
    }
  } catch (err) {
    return fail(err);
  }
}
