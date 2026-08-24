/**
 * VisioShape — Shape creation and manipulation abstraction layer.
 *
 * All coordinate work is in inches (Visio internal unit).
 * Visio page origin is bottom-left; we expose top-left to the AI.
 * Y-axis conversion: visioY = pageHeight - inputY - shapeHeight
 */

import { visioDocument } from './document';
import { visioApp } from './application';
import { logger } from '../utils/logger';
import { invalidShapeId, wrapError } from '../utils/errors';
import {
  ShapeInfo,
  AddShapeInput,
  AddShapeResult,
  DEFAULT_SHAPE_SIZES,
  ShapeType,
} from '../models/shape';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type COMObject = any;

// Visio shape master names (built-in basic shapes available without stencils)
// These are the ProgID names for Visio built-in shapes
const BASIC_SHAPE_MASTERS: Record<string, string> = {
  'rectangle': '',          // Use DrawRectangle — no master needed
  'rounded-rectangle': '',  // Use DrawRectangle with rounding
  'ellipse': '',            // Use DrawOval
  'diamond': '',            // Use DrawQuarterArc or polygon
  'triangle': '',           // Use DrawLine polygon
  'line': '',               // Use DrawLine
  'text': '',               // Use DrawRectangle with no border fill
};

// Page height default (letter landscape in inches)
const DEFAULT_PAGE_HEIGHT = 8.5;

/**
 * Convert top-left Y (AI coordinate) to Visio bottom-left Y.
 * Visio uses bottom-left origin; AI uses top-left.
 */
function toVisioY(topY: number, shapeHeight: number, pageHeight: number): number {
  return pageHeight - topY - shapeHeight;
}

/**
 * Convert Visio bottom-left Y to top-left Y (AI coordinate).
 */
function fromVisioY(visioY: number, shapeHeight: number, pageHeight: number): number {
  return pageHeight - visioY - shapeHeight;
}

/** Get page height in inches. */
function getPageHeight(page: COMObject): number {
  try {
    return Number(page.PageSheet.CellsSRC(1, 1, 0).Result('in'));
  } catch {
    return DEFAULT_PAGE_HEIGHT;
  }
}

/** Get shape ID string (e.g. "Sheet.5") from COM shape. */
function getShapeId(shape: COMObject): string {
  try {
    return `Sheet.${shape.ID}`;
  } catch {
    return 'Sheet.?';
  }
}

/** Find a shape by our ID string (e.g. "Sheet.5"). */
function findShapeById(page: COMObject, shapeId: string): COMObject {
  const idNum = parseShapeId(shapeId);
  try {
    const shapes = page.Shapes;
    const count = Number(shapes.Count);
    for (let i = 1; i <= count; i++) {
      const s = shapes.Item(i);
      if (Number(s.ID) === idNum) {
        return s;
      }
    }
  } catch {
    // fall through
  }
  throw invalidShapeId(shapeId);
}

/** Parse "Sheet.5" → 5, or throw if invalid. */
function parseShapeId(shapeId: string): number {
  if (!shapeId || typeof shapeId !== 'string') {
    throw invalidShapeId(shapeId || '');
  }
  const match = shapeId.match(/^Sheet\.(\d+)$/i);
  if (!match) {
    throw invalidShapeId(shapeId);
  }
  return parseInt(match[1], 10);
}

export class VisioShapes {
  /**
   * Add a shape to the specified page (or active page).
   * Coordinates are in inches from top-left of page.
   */
  async addShape(input: AddShapeInput): Promise<AddShapeResult> {
    const page = await visioDocument.getRawPage(input.pageIndex);
    const pageHeight = getPageHeight(page);

    const size = DEFAULT_SHAPE_SIZES[input.type];
    const w = input.width  !== undefined ? input.width  : size.width;
    const h = input.height !== undefined ? input.height : size.height;

    // Convert from top-left to Visio bottom-left Y
    const visioY = toVisioY(input.y, h, pageHeight);
    const x = input.x;

    let shape: COMObject;

    try {
      shape = this.drawBasicShape(page, input.type, x, visioY, w, h);
    } catch (err) {
      throw wrapError(err, `addShape(${input.type})`);
    }

    // Set text if provided
    if (input.text) {
      try {
        shape.Text = input.text;
      } catch {
        logger.warn('Could not set shape text', { type: input.type });
      }
    }

    // Apply style if provided
    if (input.style) {
      this.applyStyle(shape, input.style);
    }

    const shapeId = getShapeId(shape);
    logger.info('Added shape', { type: input.type, shapeId, x: input.x, y: input.y, w, h });

    return {
      shapeId,
      name: this.safeGetName(shape),
      x: input.x,
      y: input.y,
      width: w,
      height: h,
    };
  }

  /** Set text on a shape. */
  async setShapeText(shapeId: string, text: string, pageIndex?: number): Promise<void> {
    const page = await visioDocument.getRawPage(pageIndex);
    const shape = findShapeById(page, shapeId);
    try {
      shape.Text = text;
      logger.info('Set shape text', { shapeId, text });
    } catch (err) {
      throw wrapError(err, 'setShapeText');
    }
  }

  /** Move a shape to a new position (top-left coordinates in inches). */
  async moveShape(shapeId: string, x: number, y: number, pageIndex?: number): Promise<void> {
    const page = await visioDocument.getRawPage(pageIndex);
    const pageHeight = getPageHeight(page);
    const shape = findShapeById(page, shapeId);

    try {
      const w = Number(shape.Width);
      const h = Number(shape.Height);
      const visioY = toVisioY(y, h, pageHeight);
      // PinX/PinY is the center of the shape in Visio
      shape.CellsU('PinX').Result('in') ; // read test
      shape.CellsU('PinX').SetResult('in', x + w / 2, 0);
      shape.CellsU('PinY').SetResult('in', visioY + h / 2, 0);
      logger.info('Moved shape', { shapeId, x, y });
    } catch (err) {
      throw wrapError(err, 'moveShape');
    }
  }

  /** Resize a shape. */
  async resizeShape(
    shapeId: string,
    width: number,
    height: number,
    pageIndex?: number,
  ): Promise<void> {
    const page = await visioDocument.getRawPage(pageIndex);
    const shape = findShapeById(page, shapeId);
    try {
      shape.CellsU('Width').SetResult('in', width, 0);
      shape.CellsU('Height').SetResult('in', height, 0);
      logger.info('Resized shape', { shapeId, width, height });
    } catch (err) {
      throw wrapError(err, 'resizeShape');
    }
  }

  /** Delete a shape by ID. */
  async deleteShape(shapeId: string, pageIndex?: number): Promise<void> {
    const page = await visioDocument.getRawPage(pageIndex);
    const shape = findShapeById(page, shapeId);
    try {
      shape.Delete();
      logger.info('Deleted shape', { shapeId });
    } catch (err) {
      throw wrapError(err, 'deleteShape');
    }
  }

  /** Get all shapes on a page as clean ShapeInfo objects. */
  async getShapes(pageIndex?: number): Promise<ShapeInfo[]> {
    const page = await visioDocument.getRawPage(pageIndex);
    const pageHeight = getPageHeight(page);
    const pageName = String(page.Name);
    const pageIdx = pageIndex !== undefined ? pageIndex : 0;

    try {
      const shapes = page.Shapes;
      const count = Number(shapes.Count);
      const result: ShapeInfo[] = [];

      for (let i = 1; i <= count; i++) {
        const s = shapes.Item(i);
        result.push(this.buildShapeInfo(s, pageIdx, pageName, pageHeight));
      }

      return result;
    } catch (err) {
      throw wrapError(err, 'getShapes');
    }
  }

  /** Get selected shapes in the active Visio window. */
  async getSelection(): Promise<ShapeInfo[]> {
    await visioApp.ensureConnected();
    try {
      const app = visioApp.getRawApp();
      const window = app.ActiveWindow;
      if (!window) return [];

      const selection = window.Selection;
      const count = Number(selection.Count);
      const result: ShapeInfo[] = [];

      let pageHeight = DEFAULT_PAGE_HEIGHT;
      let pageName = '';
      let pageIdx = 0;

      try {
        const activePage = app.ActivePage;
        pageHeight = getPageHeight(activePage);
        pageName = String(activePage.Name);
      } catch {
        // defaults
      }

      for (let i = 1; i <= count; i++) {
        const s = selection.Item(i);
        result.push(this.buildShapeInfo(s, pageIdx, pageName, pageHeight));
      }

      return result;
    } catch (err) {
      throw wrapError(err, 'getSelection');
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private drawBasicShape(
    page: COMObject,
    type: ShapeType,
    x: number,
    visioY: number,
    w: number,
    h: number,
  ): COMObject {
    switch (type) {
      case 'rectangle':
        return page.DrawRectangle(x, visioY, x + w, visioY + h);

      case 'rounded-rectangle': {
        const rect = page.DrawRectangle(x, visioY, x + w, visioY + h);
        // Apply rounding via ShapeSheet (Rounding cell)
        try {
          rect.CellsU('Rounding').SetResult('in', 0.1, 0);
        } catch {
          // rounding not critical
        }
        return rect;
      }

      case 'ellipse':
        return page.DrawOval(x, visioY, x + w, visioY + h);

      case 'line':
        return page.DrawLine(x, visioY, x + w, visioY + h);

      case 'diamond': {
        // Draw a diamond as a polygon (4 vertices)
        const cx = x + w / 2;
        const cy = visioY + h / 2;
        const coords = [
          cx,        visioY + h, // top
          x + w,     cy,         // right
          cx,        visioY,     // bottom
          x,         cy,         // left
        ];
        return page.DrawPolyline(coords, 0);
      }

      case 'triangle': {
        const coords = [
          x + w / 2, visioY + h, // top center
          x + w,     visioY,     // bottom right
          x,         visioY,     // bottom left
          x + w / 2, visioY + h, // close
        ];
        return page.DrawPolyline(coords, 0);
      }

      case 'text': {
        const s = page.DrawRectangle(x, visioY, x + w, visioY + h);
        // No fill, no line
        try {
          s.CellsU('FillPattern').Formula = '0';   // no fill
          s.CellsU('LinePattern').Formula = '0';   // no border
        } catch {
          // style not critical
        }
        return s;
      }

      default:
        // For specialized shapes (server, database, etc.), fall back to rectangle
        // In a full implementation, these would use Visio stencil masters
        logger.warn(`Shape type "${type}" using rectangle fallback — stencil support coming soon`);
        return page.DrawRectangle(x, visioY, x + w, visioY + h);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyStyle(shape: COMObject, style: Record<string, any>): void {
    try {
      if (style.fillColor) {
        const rgb = this.hexToRGB(style.fillColor);
        if (rgb) {
          shape.CellsU('FillForegnd').FormulaU = `RGB(${rgb.r},${rgb.g},${rgb.b})`;
        }
      }
      if (style.lineColor) {
        const rgb = this.hexToRGB(style.lineColor);
        if (rgb) {
          shape.CellsU('LineColor').FormulaU = `RGB(${rgb.r},${rgb.g},${rgb.b})`;
        }
      }
      if (typeof style.lineWeight === 'number') {
        shape.CellsU('LineWeight').SetResult('pt', style.lineWeight, 0);
      }
      if (style.fontColor) {
        const rgb = this.hexToRGB(style.fontColor);
        if (rgb) {
          shape.CellsU('Char.Color').FormulaU = `RGB(${rgb.r},${rgb.g},${rgb.b})`;
        }
      }
      if (typeof style.fontSize === 'number') {
        shape.CellsU('Char.Size').SetResult('pt', style.fontSize, 0);
      }
    } catch (err) {
      logger.warn('Could not apply shape style', { error: String(err) });
    }
  }

  private hexToRGB(hex: string): { r: number; g: number; b: number } | null {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return null;
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16),
    };
  }

  private buildShapeInfo(
    shape: COMObject,
    pageIndex: number,
    pageName: string,
    pageHeight: number,
  ): ShapeInfo {
    let x = 0, y = 0, w = 0, h = 0;
    try {
      // PinX/PinY is center. Convert to top-left.
      const pinX = Number(shape.CellsU('PinX').Result('in'));
      const pinY = Number(shape.CellsU('PinY').Result('in'));
      w = Number(shape.CellsU('Width').Result('in'));
      h = Number(shape.CellsU('Height').Result('in'));
      x = pinX - w / 2;
      const visioY = pinY - h / 2;
      y = fromVisioY(visioY, h, pageHeight);
    } catch {
      // defaults
    }

    return {
      id: getShapeId(shape),
      name: this.safeGetName(shape),
      type: this.safeGetType(shape),
      text: this.safeGetText(shape),
      x,
      y,
      width: w,
      height: h,
      pageId: pageIndex,
      pageName,
    };
  }

  private safeGetName(shape: COMObject): string {
    try { return String(shape.Name); } catch { return ''; }
  }

  private safeGetType(shape: COMObject): string {
    try {
      const master = shape.Master;
      if (master) return String(master.Name);
    } catch {
      // no master
    }
    return 'Shape';
  }

  private safeGetText(shape: COMObject): string {
    try { return String(shape.Text); } catch { return ''; }
  }
}

// Singleton
export const visioShapes = new VisioShapes();
