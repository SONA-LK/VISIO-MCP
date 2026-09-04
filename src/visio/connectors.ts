/**
 * VisioConnector — Shape connection abstraction layer.
 *
 * Correct Visio COM connector approach:
 *
 *   1. page.Drop(<the "Dynamic connector" master>, x, y)
 *      — drops a routed dynamic connector at position (x,y).
 *      `Application.ConnectorToolDataObject` looks like the obvious way to
 *      get this (and is what VBA/pywin32 examples use), but it returns a
 *      raw IDataObject/IUnknown pointer that winax cannot marshal — it
 *      comes back as the literal string "[Unknown]", and passing that into
 *      Page.Drop() fails with "DispInvoke: Drop Type mismatch." every
 *      time. Dropping the real "Dynamic connector" master instead (the
 *      same shape a user gets by dragging the Connector tool in the Visio
 *      UI — found via `findDynamicConnectorMaster` below, either already
 *      docked on a fresh document or opened from CONNEC_U.VSSX) sidesteps
 *      the marshaling problem entirely and is otherwise identical.
 *
 *   2. connector.CellsU('BeginX').GlueTo(fromShape.CellsU('PinX'))
 *      — glues the connector BEGIN end to the from-shape's connection point
 *
 *   3. connector.CellsU('EndX').GlueTo(toShape.CellsU('PinX'))
 *      — glues the connector END end to the to-shape's connection point
 *
 *   GlueTo(cell) is the correct Visio COM API.
 *   GlueToPos(shape, x, y) is a different method with different semantics.
 *   BeginConnect/EndConnect only exist on the Shape.AutoConnect API.
 *
 * Fallback: If the Dynamic connector master or GlueTo are unavailable, we
 * draw a plain line between shape centers and set ObjType = 2 (connector).
 */

import * as fs from 'fs';
import { visioDocument } from './document';
import { visioApp } from './application';
import { logger } from '../utils/logger';
import { invalidShapeId, wrapError } from '../utils/errors';
import { ConnectShapesInput, ConnectShapesResult, ConnectionDetail } from '../models/connection';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type COMObject = any;

const DYNAMIC_CONNECTOR_MASTER = 'Dynamic connector';
const CONNECTOR_STENCIL_PATH =
  'C:\\Program Files\\Microsoft Office\\root\\Office16\\Visio Content\\1033\\CONNEC_U.VSSX';

/** Find the real "Dynamic connector" master — see the module doc comment
 * for why this replaces `Application.ConnectorToolDataObject`. Checks
 * already-open documents first (a fresh blank drawing docks this
 * automatically), then falls back to opening the Connectors stencil. */
function findDynamicConnectorMaster(app: COMObject): COMObject | null {
  try {
    const count = Number(app.Documents.Count);
    for (let i = 1; i <= count; i++) {
      try {
        const master = app.Documents.Item(i).Masters.Item(DYNAMIC_CONNECTOR_MASTER);
        if (master) return master;
      } catch {
        continue;
      }
    }
  } catch {
    // fall through
  }
  if (fs.existsSync(CONNECTOR_STENCIL_PATH)) {
    try {
      const doc = app.Documents.OpenEx(CONNECTOR_STENCIL_PATH, 64); // docked, read-only
      return doc.Masters.Item(DYNAMIC_CONNECTOR_MASTER);
    } catch {
      // fall through to null
    }
  }
  return null;
}

// Visio ObjType constants
const visObjTypeShape   = 1;
const visObjTypeGroup   = 2;  // also used for connector flag
const visCnnctTypeWalks = 2;  // walk (dynamic glue) connection type

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

function findShapeById(page: COMObject, shapeId: string): COMObject {
  const idNum = parseShapeId(shapeId);
  const shapes = page.Shapes;
  const count = Number(shapes.Count);
  for (let i = 1; i <= count; i++) {
    const s = shapes.Item(i);
    if (Number(s.ID) === idNum) return s;
  }
  throw invalidShapeId(shapeId);
}

function getShapeId(shape: COMObject): string {
  try {
    return `Sheet.${shape.ID}`;
  } catch {
    return 'Sheet.?';
  }
}

function getShapeCenter(shape: COMObject): { x: number; y: number } {
  try {
    return {
      x: Number(shape.CellsU('PinX').Result('in')),
      y: Number(shape.CellsU('PinY').Result('in')),
    };
  } catch {
    return { x: 1, y: 1 };
  }
}

export class VisioConnectors {
  /**
   * Create a routed connector (arrow) between two shapes.
   *
   * Strategy A (preferred): drop the real "Dynamic connector" master + GlueTo
   * Strategy B (fallback): DrawLine + set ObjType + manual glue via formula
   */
  async connectShapes(input: ConnectShapesInput): Promise<ConnectShapesResult> {
    const page = await visioDocument.getRawPage(input.pageIndex);
    const fromShape = findShapeById(page, input.fromShapeId);
    const toShape   = findShapeById(page, input.toShapeId);

    try {
      let connector: COMObject;

      // Strategy A: proper dynamic connector via the Dynamic connector master
      connector = await this.tryDropConnector(page, fromShape, toShape);

      if (!connector) {
        // Strategy B: plain line with connector flag
        connector = this.drawLineConnector(page, fromShape, toShape);
      }

      // Set connector label text
      if (input.text) {
        try {
          connector.Text = input.text;
        } catch {
          logger.warn('Could not set connector text');
        }
      }

      const connectorId = getShapeId(connector);
      logger.info('Shapes connected', {
        connectorId,
        from: input.fromShapeId,
        to: input.toShapeId,
      });

      return { connectorId, fromShapeId: input.fromShapeId, toShapeId: input.toShapeId };
    } catch (err) {
      throw wrapError(err, 'connectShapes');
    }
  }

  /**
   * Get all connections on a page.
   * Returns only shapes that are 1D (connector) shapes with endpoints glued to other shapes.
   */
  async getConnections(pageIndex?: number): Promise<ConnectionDetail[]> {
    const page = await visioDocument.getRawPage(pageIndex);

    try {
      const shapes = page.Shapes;
      const count  = Number(shapes.Count);
      const result: ConnectionDetail[] = [];

      for (let i = 1; i <= count; i++) {
        const shape = shapes.Item(i);

        // Only process 1D (connector) shapes
        let is1D = false;
        try { is1D = Number(shape.OneD) === -1 || Number(shape.OneD) === 1; } catch { /* skip */ }
        if (!is1D) continue;

        const detail = this.extractConnectionDetail(shape);
        if (detail) result.push(detail);
      }

      return result;
    } catch (err) {
      throw wrapError(err, 'getConnections');
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Strategy A: Drop the real "Dynamic connector" master and glue its
   * endpoints. This creates a proper routed dynamic connector.
   */
  private async tryDropConnector(
    page: COMObject,
    fromShape: COMObject,
    toShape: COMObject,
  ): Promise<COMObject | null> {
    try {
      const app = visioApp.getRawApp();
      const connectorMaster = findDynamicConnectorMaster(app);

      if (!connectorMaster) {
        logger.debug('Dynamic connector master not available');
        return null;
      }

      // Drop the connector roughly in the middle of the two shapes
      const from = getShapeCenter(fromShape);
      const to   = getShapeCenter(toShape);
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;

      const connector = page.Drop(connectorMaster, midX, midY);

      // Glue BeginX end to fromShape's center connection point
      // GlueTo(cell) — glues this cell to the specified cell of the target shape
      try {
        connector.CellsU('BeginX').GlueTo(fromShape.CellsU('PinX'));
      } catch (e) {
        logger.warn('GlueTo BeginX failed, using formula approach', { error: String(e) });
        // Formula approach: set BeginX/BeginY with GLUE() formula
        try {
          connector.CellsU('BeginX').FormulaU = `GLUE(Sheet.${fromShape.ID}!PinX)`;
          connector.CellsU('BeginY').FormulaU = `GLUE(Sheet.${fromShape.ID}!PinY)`;
        } catch {
          // non-critical — connector will still be drawn
        }
      }

      // Glue EndX end to toShape's center connection point
      try {
        connector.CellsU('EndX').GlueTo(toShape.CellsU('PinX'));
      } catch (e) {
        logger.warn('GlueTo EndX failed, using formula approach', { error: String(e) });
        try {
          connector.CellsU('EndX').FormulaU = `GLUE(Sheet.${toShape.ID}!PinX)`;
          connector.CellsU('EndY').FormulaU = `GLUE(Sheet.${toShape.ID}!PinY)`;
        } catch {
          // non-critical
        }
      }

      return connector;
    } catch (err) {
      logger.warn('Dynamic connector master strategy failed', { error: String(err) });
      return null;
    }
  }

  /**
   * Strategy B: Draw a plain line between shape centers, mark it as a connector.
   * Less sophisticated than Strategy A but works on all Visio versions.
   */
  private drawLineConnector(
    page: COMObject,
    fromShape: COMObject,
    toShape: COMObject,
  ): COMObject {
    const from = getShapeCenter(fromShape);
    const to   = getShapeCenter(toShape);

    const connector = page.DrawLine(from.x, from.y, to.x, to.y);

    // Mark as a connector (ObjType = 2 enables routing behaviour)
    try {
      connector.CellsU('ObjType').FormulaU = '2';
    } catch {
      // not critical
    }

    // Add arrowhead at end
    try {
      connector.CellsU('EndArrow').FormulaU = '4'; // open arrow
    } catch {
      // not critical
    }

    logger.debug('Used DrawLine connector fallback');
    return connector;
  }

  /**
   * Extract connection detail from a connector shape.
   * Reads the Connects collection which tracks which shapes are glued to each end.
   */
  private extractConnectionDetail(shape: COMObject): ConnectionDetail | null {
    const connectorId = getShapeId(shape);
    let fromId   = '';
    let fromName = '';
    let toId     = '';
    let toName   = '';

    try {
      const connects = shape.Connects;
      const count    = Number(connects.Count);

      for (let j = 1; j <= count; j++) {
        const connect     = connects.Item(j);
        const fromCellName = String(connect.FromCell.Name).toUpperCase();
        const toSheet      = connect.ToSheet;
        const toSheetName  = String(toSheet.Name);

        // BeginX cell = the START end of the connector
        if (fromCellName === 'BEGINX') {
          fromId   = getShapeId(toSheet);
          fromName = toSheetName;
        // EndX cell = the END of the connector
        } else if (fromCellName === 'ENDX') {
          toId   = getShapeId(toSheet);
          toName = toSheetName;
        }
      }
    } catch {
      // connector not yet glued — skip
    }

    if (!fromId && !toId) return null;

    return {
      connectorId,
      fromShapeId: fromId,
      fromShapeName: fromName,
      toShapeId: toId,
      toShapeName: toName,
      text: this.safeGetText(shape),
    };
  }

  private safeGetText(shape: COMObject): string {
    try { return String(shape.Text); } catch { return ''; }
  }
}

// Singleton
export const visioConnectors = new VisioConnectors();
