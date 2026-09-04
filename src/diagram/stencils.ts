/**
 * Stencil resolution -- discovery-first, not guess-first.
 *
 * Visio stencil filenames are unpredictable (the UML Activity stencil is
 * UACTME_U.vssx, matching neither "uml" nor "activity"). So we resolve the
 * stencil that actually contains a diagram type's master vocabulary by:
 *
 *   1. checking already-open documents in a running Visio for those masters,
 *   2. opening the type's candidate .vssx files and confirming the masters
 *      exist,
 *   3. scanning the installed content folder and indexing master -> file,
 *
 * and if none of that finds every required master we report
 * "needs_download" rather than installing anything silently.
 *
 * The content scan (step 3) opens stencils through Visio COM, so it needs a
 * live app; callers pass one in. Results are cached in-process.
 *
 * Ported 1:1 from visio-diagram-mcp's visio_mcp/stencils.py.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TypeSpec } from './types/registry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type COMObject = any;

export const CONTENT_DIR = 'C:\\Program Files\\Microsoft Office\\root\\Office16\\Visio Content\\1033';

export type ResolutionStatus = 'resolved' | 'partial' | 'needs_download';

export interface Resolution {
  status: ResolutionStatus;
  diagram_type: string;
  stencil_path?: string;
  found_masters: Record<string, boolean>;
  missing_masters: string[];
  message: string;
}

function resolution(r: Partial<Resolution> & Pick<Resolution, 'status' | 'diagram_type'>): Resolution {
  return {
    stencil_path: undefined,
    found_masters: {},
    missing_masters: [],
    message: '',
    ...r,
  };
}

// in-process cache of master-name -> stencil file path (lowercased master keys)
let masterIndex: Record<string, string> | null = null;

/** Reset the in-process master index cache (mainly for tests). */
export function resetMasterIndexCache(): void {
  masterIndex = null;
}

function requiredMasters(spec: TypeSpec): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ks of Object.values(spec.vocabulary)) {
    // force_primitive kinds never drop a master (see engine.ts's
    // renderNode), so they don't need one to exist in the resolved
    // stencil -- a kind with no real master at all (e.g. UML's
    // object-node box, which this stencil doesn't ship) would otherwise
    // make resolution report needs_download even though every OTHER
    // kind's master is installed.
    if (ks.force_primitive || !ks.master) continue;
    if (!seen.has(ks.master)) {
      seen.add(ks.master);
      out.push(ks.master);
    }
  }
  return out;
}

function docMasterNames(doc: COMObject): Set<string> {
  try {
    const names = new Set<string>();
    const count = Number(doc.Masters.Count);
    for (let i = 1; i <= count; i++) {
      names.add(String(doc.Masters.Item(i).Name));
    }
    return names;
  } catch {
    return new Set();
  }
}

function tryRunningDocs(app: COMObject | null, required: string[]): string | null {
  if (!app) return null;
  let count: number;
  try {
    count = Number(app.Documents.Count);
  } catch {
    return null;
  }
  const req = new Set(required);
  for (let i = 1; i <= count; i++) {
    try {
      const d = app.Documents.Item(i);
      const names = docMasterNames(d);
      const hasAll = [...req].every((m) => names.has(m));
      if (hasAll && d.FullName) return String(d.FullName);
    } catch {
      continue;
    }
  }
  return null;
}

function tryCandidates(app: COMObject | null, spec: TypeSpec, required: string[]): string | null {
  for (const fname of spec.stencils) {
    const p = path.isAbsolute(fname) ? fname : path.join(CONTENT_DIR, fname);
    if (!fs.existsSync(p)) continue;
    if (!app) {
      // can't verify masters without COM; trust the candidate exists
      return p;
    }
    try {
      const d = app.Documents.OpenEx(p, 64);
      const names = docMasterNames(d);
      if (required.every((m) => names.has(m))) return p;
    } catch {
      continue;
    }
  }
  return null;
}

function buildMasterIndex(app: COMObject | null): Record<string, string> {
  if (masterIndex !== null) return masterIndex;
  const index: Record<string, string> = {};
  if (!app) {
    masterIndex = index;
    return index;
  }
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(CONTENT_DIR)
      .filter((f) => f.toLowerCase().endsWith('_u.vssx'))
      .sort()
      .map((f) => path.join(CONTENT_DIR, f));
  } catch {
    files = [];
  }
  for (const p of files) {
    try {
      const d = app.Documents.OpenEx(p, 64);
      for (const name of docMasterNames(d)) {
        const key = name.toLowerCase();
        if (!(key in index)) index[key] = p;
      }
    } catch {
      continue;
    }
  }
  masterIndex = index;
  return index;
}

function tryIndex(app: COMObject | null, required: string[]): [string | null, string[]] {
  const index = buildMasterIndex(app);
  const hits = required.map((m) => [m, index[m.toLowerCase()]] as const);
  const missing = hits.filter(([, p]) => !p).map(([m]) => m);
  const sources = new Set(hits.map(([, p]) => p).filter((p): p is string => Boolean(p)));
  if (missing.length === 0 && sources.size === 1) {
    return [[...sources][0], []];
  }
  return [null, missing];
}

/**
 * Resolve the stencil for a diagram type. Pass a live Visio `app` to enable
 * master verification and the content-folder scan; without one, resolution
 * is limited to "does the candidate file exist".
 */
export function resolve(spec: TypeSpec, app: COMObject | null = null, useIndex = true): Resolution {
  const required = requiredMasters(spec);

  if (required.length === 0) {
    // every kind is force_primitive with no real master -- nothing to
    // resolve, the engine draws the whole vocabulary as primitives.
    return resolution({
      status: 'resolved',
      diagram_type: spec.key,
      message:
        'No stencil masters required -- every kind in this type\'s vocabulary draws as a primitive.',
    });
  }

  let p = tryRunningDocs(app, required);
  if (p) {
    return resolution({
      status: 'resolved',
      diagram_type: spec.key,
      stencil_path: p,
      found_masters: Object.fromEntries(required.map((m) => [m, true])),
      message: 'Resolved from an already-open Visio stencil.',
    });
  }

  p = tryCandidates(app, spec, required);
  if (p) {
    return resolution({
      status: 'resolved',
      diagram_type: spec.key,
      stencil_path: p,
      found_masters: Object.fromEntries(required.map((m) => [m, true])),
      message: `Resolved candidate stencil ${path.basename(p)}.`,
    });
  }

  if (useIndex && app) {
    const [indexPath, missing] = tryIndex(app, required);
    if (indexPath) {
      return resolution({
        status: 'resolved',
        diagram_type: spec.key,
        stencil_path: indexPath,
        found_masters: Object.fromEntries(required.map((m) => [m, true])),
        message: `Resolved via master index (${path.basename(indexPath)}).`,
      });
    }
    if (missing.length > 0 && missing.length < required.length) {
      return resolution({
        status: 'partial',
        diagram_type: spec.key,
        found_masters: Object.fromEntries(required.filter((m) => !missing.includes(m)).map((m) => [m, true])),
        missing_masters: missing,
        message:
          'Some masters found but no single installed stencil covers the whole vocabulary; ' +
          'primitive fallback will fill the gaps.',
      });
    }
  }

  // nothing installed covers this type
  return resolution({
    status: 'needs_download',
    diagram_type: spec.key,
    missing_masters: required,
    message:
      `No installed stencil provides the ${spec.friendly} masters (${required.join(', ')}). ` +
      `This diagram type's stencil is not installed. Open the '${spec.friendly}' template once ` +
      `in Visio to download it, or proceed with primitive drawing.`,
  });
}
