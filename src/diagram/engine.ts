/**
 * Visio COM rendering engine.
 *
 * Takes a fully-positioned Diagram IR plus its TypeSpec and a resolved
 * stencil, and draws it in Microsoft Visio: px->inch conversion, fill/line/
 * text helpers, diamond text-centering, master drop + resize (with a
 * primitive-drawing fallback), orthogonal connectors glued by side, .vsdx
 * save, and PNG export at a specific dpi. Visio is kept visible and is
 * never quit.
 *
 * Ported from visio-diagram-mcp's visio_mcp/engine.py, adapted to this
 * repo's winax/COM conventions (CellsU universal cell names, and the
 * existing `visioApp` singleton for connect/reconnect instead of a second
 * independent connection strategy).
 */

import * as fs from 'fs';
import * as path from 'path';
import { visioApp } from '../visio/application';
import { logger } from '../utils/logger';
import { wrapError } from '../utils/errors';
import { Diagram, Node as DiagramNode, Edge } from './ir';
import { TypeSpec, KindSpec, EdgeStyle } from './types/registry';
import { CONTENT_DIR } from './stencils';

// `Application.ConnectorToolDataObject` (the approach both the Python
// reference and this repo's own low-level connect_shapes tool started
// with) returns a raw IDataObject/IUnknown pointer that winax cannot
// marshal -- it comes back as the string "[Unknown]" instead of a usable
// reference, and passing that into Page.Drop() fails with "DispInvoke:
// Drop Type mismatch." Dropping the real "Dynamic connector" master
// instead (the same master a user gets by dragging the Connector tool in
// the Visio UI) sidesteps the marshaling problem entirely and is
// discovered the same way node masters are: a fresh blank drawing docks
// the Basic/Connector/Flowchart stencils automatically, so it's usually
// already open; CONNEC_U.VSSX is the fallback if not.
const DYNAMIC_CONNECTOR_MASTER = 'Dynamic connector';
const CONNECTOR_STENCIL_CANDIDATES = ['CONNEC_U.VSSX'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type COMObject = any;

export interface RenderResult {
  vsdx: string;
  png: string;
  log: string[];
}

// --------------------------------------------------------------------------
// coordinate helpers (px @96dpi, top-left origin  ->  Visio inches, y-up)
// --------------------------------------------------------------------------
export function pxX(px: number): number {
  return px / 96.0;
}

export function pxY(px: number, pageHIn: number): number {
  return pageHIn - px / 96.0;
}

export function hexToRgb(hexColor: string): [number, number, number] {
  const h = hexColor.replace('#', '');
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

// --------------------------------------------------------------------------
// cell helpers (operate on a live Visio shape)
// --------------------------------------------------------------------------
function setFill(shape: COMObject, hexColor: string): void {
  const [r, g, b] = hexToRgb(hexColor);
  shape.CellsU('FillForegnd').FormulaU = `RGB(${r},${g},${b})`;
  shape.CellsU('FillPattern').FormulaU = '1';
}

function setNoFill(shape: COMObject): void {
  shape.CellsU('FillPattern').FormulaU = '0';
}

function setLine(shape: COMObject, hexColor: string, weightPt: number, dashed = false): void {
  const [r, g, b] = hexToRgb(hexColor);
  shape.CellsU('LineColor').FormulaU = `RGB(${r},${g},${b})`;
  shape.CellsU('LineWeight').FormulaU = `${weightPt} pt`;
  shape.CellsU('LinePattern').FormulaU = dashed ? '2' : '1';
}

function setText(shape: COMObject, text: string, sizePt: number, colorHex?: string): void {
  shape.Text = text;
  shape.CellsU('Char.Size').FormulaU = `${sizePt} pt`;
  if (colorHex) {
    const [r, g, b] = hexToRgb(colorHex);
    shape.CellsU('Char.Color').FormulaU = `RGB(${r},${g},${b})`;
  }
}

/** UML Decision/Merge masters anchor the label below the shape; re-pin it to
 * the shape center so the question text sits inside the diamond. */
function centerTextBlock(shape: COMObject): void {
  const cells: [string, string][] = [
    ['TxtPinX', 'Width*0.5'],
    ['TxtPinY', 'Height*0.5'],
    ['TxtLocPinX', 'TxtWidth*0.5'],
    ['TxtLocPinY', 'TxtHeight*0.5'],
    ['TxtAngle', '0 deg'],
  ];
  for (const [cell, formula] of cells) {
    try {
      shape.CellsU(cell).FormulaU = formula;
    } catch {
      // non-critical
    }
  }
}

// --------------------------------------------------------------------------
// engine
// --------------------------------------------------------------------------
export class VisioEngine {
  app: COMObject | null = null;
  log: string[] = [];
  private connectorMaster: COMObject | null = null;

  async connect(): Promise<void> {
    // Deliberately returns void, not the raw COM object: returning a COM
    // proxy as the resolved value of an async function makes the runtime's
    // promise-resolution machinery probe it for a `.then` property, and
    // winax's property-miss handling throws instead of yielding
    // `undefined` for an unknown property -- read `this.app` after
    // awaiting this instead of using the return value.
    await visioApp.ensureConnected();
    this.app = visioApp.getRawApp();
    this.log.push('Connected to Visio.');
  }

  // -- stencil masters ----------------------------------------------------
  private openStencil(stencilPath: string | undefined): COMObject | null {
    if (!stencilPath || !fs.existsSync(stencilPath)) return null;
    try {
      return this.app.Documents.OpenEx(stencilPath, 64); // docked, read-only
    } catch (e) {
      this.log.push(`Could not open stencil ${stencilPath}: ${String(e)}`);
      return null;
    }
  }

  /** Resolve the real "Dynamic connector" master (see the module-level
   * comment for why we drop this instead of using
   * Application.ConnectorToolDataObject). Cached per render() call. */
  private findConnectorMaster(): COMObject | null {
    if (this.connectorMaster) return this.connectorMaster;

    try {
      const count = Number(this.app.Documents.Count);
      for (let i = 1; i <= count; i++) {
        try {
          const d = this.app.Documents.Item(i);
          const m = d.Masters.Item(DYNAMIC_CONNECTOR_MASTER);
          if (m) {
            this.connectorMaster = m;
            return m;
          }
        } catch {
          continue;
        }
      }
    } catch {
      // fall through to opening the stencil explicitly
    }

    for (const fname of CONNECTOR_STENCIL_CANDIDATES) {
      const p = path.join(CONTENT_DIR, fname);
      if (!fs.existsSync(p)) continue;
      try {
        const d = this.app.Documents.OpenEx(p, 64);
        const m = d.Masters.Item(DYNAMIC_CONNECTOR_MASTER);
        if (m) {
          this.connectorMaster = m;
          return m;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  // -- primitive drawing (fallback when a master is unavailable) ----------
  private drawPrimitive(
    page: COMObject,
    ks: KindSpec,
    cx: number,
    cy: number,
    w: number,
    h: number,
    pageHIn: number,
  ): COMObject[] {
    const prim = ks.primitive;
    const left = cx - w / 2;
    const right = cx + w / 2;
    const top = cy - h / 2;
    const bottom = cy + h / 2;

    const box = (l: number, t: number, r: number, b: number): COMObject =>
      page.DrawRectangle(pxX(l), pxY(b, pageHIn), pxX(r), pxY(t, pageHIn));

    if (prim === 'rect' || prim === 'rounded_rect' || prim === 'bar') {
      const s = box(left, top, right, bottom);
      if (prim === 'rounded_rect' && ks.rounding_in) {
        try {
          s.CellsU('Rounding').FormulaU = `${ks.rounding_in} in`;
        } catch {
          // rounding not critical
        }
      }
      return [s];
    }
    if (prim === 'divided_rect') {
      // UML object-node box: no master for this anywhere in the installed
      // UML Activity stencil, so it's a plain rect with a horizontal
      // divider at mid-height -- name goes above the line, [state] below
      // (node.label should carry both, separated by "\n").
      const s = box(left, top, right, bottom);
      const divider = page.DrawLine(pxX(left), pxY(cy, pageHIn), pxX(right), pxY(cy, pageHIn));
      return [s, divider];
    }
    if (prim === 'circle') {
      const s = page.DrawOval(pxX(left), pxY(bottom, pageHIn), pxX(right), pxY(top, pageHIn));
      return [s];
    }
    if (prim === 'double_circle') {
      const outer = page.DrawOval(pxX(left), pxY(bottom, pageHIn), pxX(right), pxY(top, pageHIn));
      const ir = w * 0.32; // inner radius ratio ~ 0.11/0.17
      const inl = cx - ir;
      const inr = cx + ir;
      const intop = cy - ir;
      const inb = cy + ir;
      const inner = page.DrawOval(pxX(inl), pxY(inb, pageHIn), pxX(inr), pxY(intop, pageHIn));
      return [outer, inner];
    }
    if (prim === 'diamond') {
      // closed diamond via polyline (top, right, bottom, left, back to top)
      const pts = [cx, top, right, cy, cx, bottom, left, cy, cx, top];
      const flat: number[] = [];
      for (let i = 0; i < pts.length; i += 2) {
        flat.push(pxX(pts[i]), pxY(pts[i + 1], pageHIn));
      }
      const s = page.DrawPolyline(flat, 0);
      return [s];
    }
    // default
    return [box(left, top, right, bottom)];
  }

  // -- node rendering -------------------------------------------------------
  private renderNode(
    page: COMObject,
    spec: TypeSpec,
    node: DiagramNode,
    stencil: COMObject | null,
    masterCache: Map<string, COMObject>,
    pageHIn: number,
  ): COMObject {
    const ks = spec.vocabulary[node.kind];
    const w = node.w ?? ks.default_w;
    const h = node.h ?? ks.default_h;
    const cx = node.x!;
    const cy = node.y!;

    let shape: COMObject = null;
    let usedMaster = false;
    if (stencil !== null && !ks.force_primitive && ks.master) {
      let master = masterCache.get(ks.master);
      if (!master) {
        try {
          master = stencil.Masters.Item(ks.master);
          masterCache.set(ks.master, master);
        } catch {
          master = undefined;
        }
      }
      if (master) {
        try {
          shape = page.Drop(master, pxX(cx), pxY(cy, pageHIn));
          shape.CellsU('Width').FormulaU = `${w / 96.0} in`;
          shape.CellsU('Height').FormulaU = `${h / 96.0} in`;
          usedMaster = true;
        } catch (e) {
          this.log.push(`Drop master ${JSON.stringify(ks.master)} failed: ${String(e)}`);
          shape = null;
        }
      }
    }

    const style = node.style ?? {};
    const overrideFill = style.fill as string | undefined;
    const overrideLine = style.line as string | undefined;

    let outerUnfilled = false;
    if (shape === null) {
      // primitive fallback
      const drawn = this.drawPrimitive(page, ks, cx, cy, w, h, pageHIn);
      shape = drawn[0];
      if (ks.primitive === 'double_circle' && drawn.length === 2) {
        // UML final-node bullseye: an unfilled outer ring around a solid
        // inner dot. Filling both the same color makes the ring invisible.
        const [outer, inner] = drawn;
        setNoFill(outer);
        setLine(outer, overrideLine ?? ks.line ?? '#000000', ks.line_weight_pt);
        this.styleShape(inner, ks, true, overrideFill, overrideLine);
        outerUnfilled = true;
      } else {
        // style every piece of a composite primitive (e.g. a divided_rect's
        // rect + divider line)
        for (const extra of drawn) {
          this.styleShape(extra, ks, true, overrideFill, overrideLine);
        }
      }
    }
    // styling (applies to both master and primitive primary shape) -- skip
    // for double_circle's outer ring, already deliberately unfilled
    if (!outerUnfilled) {
      this.styleShape(shape, ks, !usedMaster, overrideFill, overrideLine);
    }

    // rounding for master-based rounded rects
    if (usedMaster && ks.rounding_in !== undefined) {
      try {
        shape.CellsU('Rounding').FormulaU = `${ks.rounding_in} in`;
      } catch {
        // non-critical
      }
    }

    // text
    const label = ks.text ? node.label : '';
    if (ks.text) {
      const size = Number(style.text_size_pt ?? ks.text_size_pt);
      setText(shape, label, size);
      if (ks.center_text) centerTextBlock(shape);
    } else {
      try {
        shape.Text = '';
      } catch {
        // non-critical
      }
    }

    try {
      shape.Name = node.id;
    } catch {
      // non-critical
    }
    return shape;
  }

  private styleShape(
    shape: COMObject,
    ks: KindSpec,
    isPrimitive: boolean,
    fill?: string,
    line?: string,
  ): void {
    // Per-node style (node.style={fill, line}), set only when the
    // requirement explicitly calls for a color on this node, wins over the
    // diagram type's default.
    const styleFill = fill ?? ks.fill;
    const styleLine = line ?? ks.line;
    if (styleFill) setFill(shape, styleFill);
    if (styleLine) setLine(shape, styleLine, ks.line_weight_pt);
  }

  // -- edge rendering -------------------------------------------------------
  /**
   * Map an orthogonal segment direction (px, y-down) to a (u, v) fractional
   * connection point on a shape's local box, where u runs left(0)->right(1)
   * and v runs bottom(0)->top(1) (Visio is y-up).
   *
   * mirror=false gives the point the segment *exits* (source side);
   * mirror=true gives the point the segment *enters* (target side, i.e. the
   * opposite edge of the same directional segment).
   */
  static sideUV(dx: number, dy: number, mirror = false): [number, number] {
    if (dx === 0 && dy !== 0) {
      const exitBottom = dy > 0 !== mirror;
      return [0.5, exitBottom ? 0.0 : 1.0];
    }
    if (dy === 0 && dx !== 0) {
      const exitRight = dx > 0 !== mirror;
      return [exitRight ? 1.0 : 0.0, 0.5];
    }
    return [0.5, 0.5]; // degenerate/diagonal segment -> shape center
  }

  private renderEdge(
    page: COMObject,
    edge: Edge,
    es: EdgeStyle,
    pageHIn: number,
    shapeById: Map<string, COMObject>,
    kindById: Map<string, string>,
  ): COMObject | null {
    const pts = edge.waypoints;
    if (pts.length < 2) return null;

    // A real 1-D connector shape (dropped from the Dynamic connector
    // master, as opposed to a DrawPolyline'd 2-D freeform) is required for
    // Cell.GlueTo/GlueToPos to create an actual Visio glue relationship.
    // Without this, connectors are only positioned to *look* attached and
    // visibly detach the moment a shape is moved.
    const connectorMaster = this.findConnectorMaster();
    if (!connectorMaster) {
      this.log.push(
        `No Dynamic connector master available -- skipped edge ${edge.source} -> ${edge.target}.`,
      );
      return null;
    }
    const conn = page.Drop(connectorMaster, pxX(pts[0][0]), pxY(pts[0][1], pageHIn));
    setNoFill(conn);

    let dashed: boolean;
    if (edge.flow === 'object') {
      dashed = true;
    } else if (edge.flow === 'control') {
      dashed = false;
    } else {
      // auto-detect: an edge touching an "object_state" node is an object
      // flow (dashed) per notations that distinguish the two, even if the
      // caller didn't tag it explicitly.
      dashed = kindById.get(edge.source) === 'object_state' || kindById.get(edge.target) === 'object_state';
    }
    setLine(conn, es.line, es.line_weight_pt, dashed);
    conn.CellsU('BeginArrow').FormulaU = es.begin_arrow;
    conn.CellsU('EndArrow').FormulaU = es.end_arrow;
    try {
      conn.CellsU('ShapeRouteStyle').FormulaU = edge.routing !== 'straight' ? '1' : '3';
    } catch {
      // non-critical
    }

    const beginShape = shapeById.get(edge.source);
    const endShape = shapeById.get(edge.target);

    const [bx, by] = pts[0];
    const [b2x, b2y] = pts[1];
    const [e2x, e2y] = pts[pts.length - 2];
    const [ex, ey] = pts[pts.length - 1];

    let gluedBegin = false;
    if (beginShape) {
      const [u, v] = VisioEngine.sideUV(b2x - bx, b2y - by, false);
      try {
        conn.CellsU('BeginX').GlueToPos(beginShape, u, v);
        gluedBegin = true;
      } catch (e) {
        this.log.push(`Glue begin failed for ${edge.source} -> ${edge.target}: ${String(e)}`);
      }
    }
    if (!gluedBegin) {
      conn.CellsU('BeginX').FormulaU = `${pxX(bx)} in`;
      conn.CellsU('BeginY').FormulaU = `${pxY(by, pageHIn)} in`;
    }

    let gluedEnd = false;
    if (endShape) {
      const [u, v] = VisioEngine.sideUV(ex - e2x, ey - e2y, true);
      try {
        conn.CellsU('EndX').GlueToPos(endShape, u, v);
        gluedEnd = true;
      } catch (e) {
        this.log.push(`Glue end failed for ${edge.source} -> ${edge.target}: ${String(e)}`);
      }
    }
    if (!gluedEnd) {
      conn.CellsU('EndX').FormulaU = `${pxX(ex)} in`;
      conn.CellsU('EndY').FormulaU = `${pxY(ey, pageHIn)} in`;
    }

    if (edge.label) {
      // Set the guard text directly on the connector shape (not a detached
      // rectangle) so Visio treats it as the connector's native label:
      // it's glued to the connector and moves/reroutes with it
      // automatically whenever either endpoint shape moves. Visio
      // auto-places native connector text at the route's geometric
      // midpoint; we don't override TxtPinX/Y with an absolute position
      // because that would just reintroduce a fixed, unglued placement
      // under a different name.
      setText(conn, edge.label, es.label_size_pt, es.label_color);
    }
    return conn;
  }

  // -- top-level render -----------------------------------------------------
  async render(
    diagram: Diagram,
    spec: TypeSpec,
    stencilPath: string | undefined,
    outVsdx: string,
    outPng: string,
    pngDpi = 150,
  ): Promise<RenderResult> {
    this.connectorMaster = null; // may belong to a doc closed since the last render()
    if (this.app === null) {
      await this.connect();
    } else {
      try {
        void this.app.Visible;
      } catch {
        this.log.push('Cached Visio connection is dead; reconnecting.');
        this.app = null;
        await this.connect();
      }
    }

    const outName = path.basename(outVsdx).toLowerCase();
    try {
      for (let i = Number(this.app.Documents.Count); i >= 1; i--) {
        const d = this.app.Documents.Item(i);
        try {
          if (String(d.Name).toLowerCase() === outName) {
            d.Close();
            this.log.push(`Closed previously-open ${d.Name}.`);
          }
        } catch {
          // non-critical
        }
      }
    } catch (e) {
      throw wrapError(e, 'render:closePreviousDocuments');
    }

    const stencil = this.openStencil(stencilPath);
    if (stencil !== null) {
      this.log.push(`Using stencil masters: ${path.basename(stencilPath!)}`);
    } else {
      this.log.push('No stencil resolved -> primitive drawing fallback.');
    }

    const pageWIn = diagram.page.width_in;
    const pageHIn = diagram.page.height_in;

    let doc: COMObject;
    let page: COMObject;
    try {
      doc = this.app.Documents.Add('');
      page = doc.Pages.Item(1);
      page.PageSheet.CellsU('PageWidth').FormulaU = `${pageWIn} in`;
      page.PageSheet.CellsU('PageHeight').FormulaU = `${pageHIn} in`;
      try {
        page.PageSheet.CellsU('PrintPageOrientation').FormulaU =
          diagram.page.orientation === 'landscape' ? '2' : '1';
      } catch {
        // non-critical
      }
    } catch (e) {
      throw wrapError(e, 'render:createDocument');
    }

    const masterCache = new Map<string, COMObject>();
    const shapeById = new Map<string, COMObject>();
    const kindById = new Map<string, string>(diagram.nodes.map((n) => [n.id, n.kind]));

    try {
      for (const node of diagram.nodes) {
        shapeById.set(node.id, this.renderNode(page, spec, node, stencil, masterCache, pageHIn));
      }
    } catch (e) {
      throw wrapError(e, `render:drawNodes(shapeById has ${shapeById.size}/${diagram.nodes.length})`);
    }
    try {
      for (const edge of diagram.edges) {
        this.renderEdge(page, edge, spec.edge_style, pageHIn, shapeById, kindById);
      }
    } catch (e) {
      throw wrapError(e, 'render:drawEdges');
    }

    try {
      doc.SaveAs(outVsdx);
      this.log.push(`Saved VSDX: ${outVsdx}`);
    } catch (e) {
      throw wrapError(e, 'render:saveVsdx');
    }

    try {
      this.app.Settings.SetRasterExportResolution(false, pngDpi, pngDpi, 4);
    } catch (e) {
      this.log.push(`Native dpi API unavailable (${String(e)}); PNG will use Visio's default export dpi.`);
    }
    try {
      page.Export(outPng);
      this.log.push(`Exported PNG: ${outPng}`);
    } catch (e) {
      throw wrapError(e, 'render:exportPng');
    }

    try {
      doc.Save();
    } catch (e) {
      logger.warn('Could not re-save document after PNG export', { error: String(e) });
    }

    return { vsdx: outVsdx, png: outPng, log: [...this.log] };
  }
}
