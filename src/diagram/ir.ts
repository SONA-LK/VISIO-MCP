/**
 * Diagram IR — the JSON contract that flows analyze -> plan -> design.
 *
 * A diagram is `diagram_type` + `nodes` + `edges` + `page`. Coordinates use
 * pixels at 96 dpi, origin top-left, values are shape CENTERS (width/height
 * also in px). The engine converts to Visio inches (origin bottom-left) at
 * render time.
 *
 * Field names deliberately match the visio-diagram-mcp reference IR 1:1
 * (snake_case, same keys) rather than this repo's usual camelCase — this is
 * a port of that proven contract, and keeping the names identical keeps the
 * porting surface (and any future re-sync) low-risk.
 */

import { KindSpec } from './types/registry';

export interface Page {
  width_in: number;
  height_in: number;
  orientation: 'portrait' | 'landscape';
}

export function pageFromDict(d: Partial<Page> | undefined | null): Page {
  return {
    width_in: d?.width_in ?? 8.5,
    height_in: d?.height_in ?? 11.0,
    orientation: d?.orientation ?? 'portrait',
  };
}

export interface Node {
  id: string;
  kind: string;
  label: string;
  // Geometry in px @96dpi, top-left origin, CENTER coords. Any of these may
  // be undefined -> auto-layout fills them in. Explicit values always win
  // (manual override).
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  style: Record<string, unknown>;
}

export function nodeFromDict(d: Record<string, unknown>): Node {
  return {
    id: String(d.id),
    kind: String(d.kind),
    label: d.label !== undefined ? String(d.label) : '',
    x: optFloat(d.x),
    y: optFloat(d.y),
    w: optFloat(d.w),
    h: optFloat(d.h),
    style: (d.style as Record<string, unknown>) ?? {},
  };
}

export interface Edge {
  source: string;
  target: string;
  label: string; // guard / message text, e.g. "[yes]"
  routing: 'orthogonal' | 'straight';
  // Optional explicit waypoints in px (list of [x, y]); overrides auto-routing.
  waypoints: [number, number][];
  // Optional side hints for layout, e.g. "left"/"right"/"top"/"bottom".
  source_side?: string;
  target_side?: string;
  label_pos?: [number, number];
  // "control" (solid) | "object" (dashed) | undefined -> auto-detect: an
  // edge touching an "object_state" node renders dashed even if left unset.
  flow?: 'control' | 'object';
}

export function edgeFromDict(d: Record<string, unknown>): Edge {
  const waypoints = Array.isArray(d.waypoints)
    ? (d.waypoints as unknown[]).map((p) => {
        const pair = p as [number, number];
        return [Number(pair[0]), Number(pair[1])] as [number, number];
      })
    : [];
  return {
    source: String(d.source),
    target: String(d.target),
    label: d.label !== undefined ? String(d.label) : '',
    routing: (d.routing as 'orthogonal' | 'straight') ?? 'orthogonal',
    waypoints,
    source_side: d.source_side as string | undefined,
    target_side: d.target_side as string | undefined,
    label_pos: d.label_pos ? (d.label_pos as [number, number]) : undefined,
    flow: d.flow as 'control' | 'object' | undefined,
  };
}

export interface Diagram {
  diagram_type: string;
  title: string;
  nodes: Node[];
  edges: Edge[];
  page: Page;
}

export function diagramFromDict(d: Record<string, unknown>): Diagram {
  return {
    diagram_type: String(d.diagram_type),
    title: d.title !== undefined ? String(d.title) : '',
    page: pageFromDict(d.page as Partial<Page> | undefined),
    nodes: Array.isArray(d.nodes) ? (d.nodes as Record<string, unknown>[]).map(nodeFromDict) : [],
    edges: Array.isArray(d.edges) ? (d.edges as Record<string, unknown>[]).map(edgeFromDict) : [],
  };
}

export function diagramToDict(diagram: Diagram): Record<string, unknown> {
  return {
    diagram_type: diagram.diagram_type,
    title: diagram.title,
    page: { ...diagram.page },
    nodes: diagram.nodes.map((n) => ({ ...n })),
    edges: diagram.edges.map((e) => ({ ...e })),
  };
}

export function nodeById(diagram: Diagram, id: string): Node | undefined {
  return diagram.nodes.find((n) => n.id === id);
}

function optFloat(v: unknown): number | undefined {
  return v === undefined || v === null ? undefined : Number(v);
}

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

/**
 * Structural + vocabulary validation. Returns a list of human-readable
 * problems (empty == valid). `allowedKinds` is the chosen type's vocabulary;
 * any node kind outside it is rejected -- this is what stops one diagram
 * type's elements from leaking into another. `vocabulary` (kind -> KindSpec),
 * if given, additionally enforces each kind's minInDegree/minOutDegree -- a
 * control node that doesn't meet its minimum degree is meaningless (e.g. a
 * "merge" with only one incoming edge combines nothing) and should be
 * flagged instead of silently rendered.
 */
export function validateStructure(
  diagram: Diagram,
  allowedKinds: Set<string>,
  vocabulary?: Record<string, KindSpec>,
): string[] {
  const problems: string[] = [];

  if (diagram.nodes.length === 0) {
    problems.push('diagram has no nodes');
  }

  const seenIds = new Set<string>();
  for (const n of diagram.nodes) {
    if (seenIds.has(n.id)) {
      problems.push(`duplicate node id: ${JSON.stringify(n.id)}`);
    }
    seenIds.add(n.id);
    if (!allowedKinds.has(n.kind)) {
      problems.push(
        `node ${JSON.stringify(n.id)} has kind ${JSON.stringify(n.kind)} which is not in the ` +
          `'${diagram.diagram_type}' vocabulary (${JSON.stringify(
            [...allowedKinds].sort(),
          )}) - element types must not be mixed`,
      );
    }
  }

  diagram.edges.forEach((e, i) => {
    if (!seenIds.has(e.source)) {
      problems.push(`edge #${i} source ${JSON.stringify(e.source)} is not a known node`);
    }
    if (!seenIds.has(e.target)) {
      problems.push(`edge #${i} target ${JSON.stringify(e.target)} is not a known node`);
    }
  });

  if (vocabulary) {
    const inDeg: Record<string, number> = {};
    const outDeg: Record<string, number> = {};
    for (const e of diagram.edges) {
      outDeg[e.source] = (outDeg[e.source] ?? 0) + 1;
      inDeg[e.target] = (inDeg[e.target] ?? 0) + 1;
    }
    for (const n of diagram.nodes) {
      const ks = vocabulary[n.kind];
      if (!ks) continue;
      if (ks.min_in_degree !== undefined && (inDeg[n.id] ?? 0) < ks.min_in_degree) {
        problems.push(
          `node ${JSON.stringify(n.id)} (kind ${JSON.stringify(n.kind)}) has only ` +
            `${inDeg[n.id] ?? 0} incoming edge(s), needs ${ks.min_in_degree}+ -- a ${n.kind} ` +
            `with fewer combines nothing; remove it and connect its source(s) directly ` +
            `to its target instead`,
        );
      }
      if (ks.min_out_degree !== undefined && (outDeg[n.id] ?? 0) < ks.min_out_degree) {
        problems.push(
          `node ${JSON.stringify(n.id)} (kind ${JSON.stringify(n.kind)}) has only ` +
            `${outDeg[n.id] ?? 0} outgoing edge(s), needs ${ks.min_out_degree}+ -- a ${n.kind} ` +
            `with fewer splits nothing; remove it and connect its source directly to ` +
            `its target(s) instead`,
        );
      }
    }
  }

  return problems;
}

/**
 * Geometry checks used after layout: everything positioned, on-page, and no
 * two node bounding boxes overlapping. Returns problems (empty == valid).
 */
export function validateGeometry(diagram: Diagram): string[] {
  const problems: string[] = [];
  const pageWPx = diagram.page.width_in * 96.0;
  const pageHPx = diagram.page.height_in * 96.0;

  type Box = [string, number, number, number, number]; // id, left, top, right, bottom
  const boxes: Box[] = [];

  for (const n of diagram.nodes) {
    if (n.x === undefined || n.y === undefined || n.w === undefined || n.h === undefined) {
      problems.push(`node ${JSON.stringify(n.id)} is not fully positioned after layout`);
      continue;
    }
    const left = n.x - n.w / 2;
    const right = n.x + n.w / 2;
    const top = n.y - n.h / 2;
    const bottom = n.y + n.h / 2;
    if (left < 0 || top < 0 || right > pageWPx || bottom > pageHPx) {
      problems.push(`node ${JSON.stringify(n.id)} falls outside the page bounds`);
    }
    boxes.push([n.id, left, top, right, bottom]);
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      overlapCheck(boxes[i], boxes[j], problems);
    }
  }

  return problems;
}

function overlapCheck(
  a: [string, number, number, number, number],
  b: [string, number, number, number, number],
  problems: string[],
): void {
  const [aid, al, at, ar, ab] = a;
  const [bid, bl, bt, br, bb] = b;
  // small tolerance so touching edges don't count as overlap
  const tol = 0.5;
  if (al < br - tol && ar > bl + tol && at < bb - tol && ab > bt + tol) {
    problems.push(`nodes ${JSON.stringify(aid)} and ${JSON.stringify(bid)} overlap`);
  }
}
