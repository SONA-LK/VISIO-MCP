/**
 * MCP tool implementations for the diagram-generation pipeline
 * (analyze -> plan -> design), ported from visio-diagram-mcp's server.py.
 *
 * The server is a deterministic renderer + geometry/stencil helper -- the
 * calling LLM does the reasoning (picks the diagram type, extracts nodes
 * and edges from the requirement) and calls these tools in sequence.
 *
 * Follows this file's sibling `tools.ts` conventions: Zod-validated input,
 * plain JSON-serializable output, never throws out of a handler.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ZodSchema } from 'zod';
import { logger } from '../utils/logger';
import { invalidInput, wrapError } from '../utils/errors';
import { normalizePath, ensureDirectory } from '../utils/paths';
import { getConfigDirPath } from '../config/config';
import {
  Diagram,
  diagramFromDict,
  diagramToDict,
  validateStructure,
  validateGeometry,
} from '../diagram/ir';
import { get as getTypeSpec, allSpecs, allowedKinds, TypeSpec } from '../diagram/types/registry';
import '../diagram/types/index'; // registers builtin diagram types
import { layout } from '../diagram/layout/layered';
import { resolve as resolveStencil } from '../diagram/stencils';
import { VisioEngine } from '../diagram/engine';

import {
  ListDiagramTypesSchema,
  GetTypeVocabularySchema,
  ResolveStencilSchema,
  ValidateSpecSchema,
  AnalyzeRequirementSchema,
  PlanDiagramSchema,
  DesignDiagramSchema,
} from './diagramSchemas';

function validate<T>(schema: ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    throw wrapError(new Error(`Validation failed — ${issues}`));
  }
  return result.data;
}

function typeMenu(): unknown[] {
  return allSpecs().map((s) => ({
    key: s.key,
    name: s.friendly,
    description: s.description,
    kinds: Object.keys(s.vocabulary).sort(),
    layout: s.layout,
  }));
}

function getSpecOrThrow(diagramType: string): TypeSpec {
  try {
    return getTypeSpec(diagramType);
  } catch (e) {
    throw invalidInput('diagram_type', e instanceof Error ? e.message : String(e));
  }
}

// -- artifacts (analysis.json / plan.json, one per phase, for inspection) --
function artifactsDir(): string {
  return path.join(getConfigDirPath(), 'artifacts');
}

function writeArtifact(name: string, obj: unknown): string {
  const dir = artifactsDir();
  ensureDirectory(dir);
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf-8');
  return p;
}

// -- shared engine (one Visio connection, created lazily) -------------------
let sharedEngine: VisioEngine | null = null;

async function getEngine(): Promise<VisioEngine> {
  if (!sharedEngine) {
    sharedEngine = new VisioEngine();
    await sharedEngine.connect();
  }
  return sharedEngine;
}

// ==========================================================================
// helper tools
// ==========================================================================

export async function listDiagramTypes(rawInput: unknown): Promise<Record<string, unknown>> {
  validate(ListDiagramTypesSchema, rawInput);
  return { types: typeMenu() };
}

export async function getTypeVocabulary(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(GetTypeVocabularySchema, rawInput);
  const spec = getSpecOrThrow(input.diagram_type);
  return {
    diagram_type: spec.key,
    name: spec.friendly,
    start_kinds: [...spec.start_kinds],
    kinds: Object.fromEntries(
      Object.entries(spec.vocabulary).map(([k, ks]) => [
        k,
        {
          master: ks.master,
          default_w: ks.default_w,
          default_h: ks.default_h,
          carries_text: ks.text,
          fill: ks.fill,
          line: ks.line,
        },
      ]),
    ),
  };
}

export async function resolveStencilTool(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(ResolveStencilSchema, rawInput);
  const spec = getSpecOrThrow(input.diagram_type);
  let app = null;
  try {
    app = (await getEngine()).app;
  } catch {
    app = null; // resolution still works filesystem-only without a live Visio
  }
  return resolveStencil(spec, app) as unknown as Record<string, unknown>;
}

export async function validateSpecTool(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(ValidateSpecSchema, rawInput);
  let diagram: Diagram;
  let typeSpec: TypeSpec;
  try {
    diagram = diagramFromDict(input.spec);
    typeSpec = getTypeSpec(diagram.diagram_type);
  } catch (e) {
    return { ok: false, problems: [`could not parse spec: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const problems = validateStructure(diagram, allowedKinds(typeSpec), typeSpec.vocabulary);
  if (diagram.nodes.every((n) => n.x !== undefined && n.y !== undefined)) {
    problems.push(...validateGeometry(diagram));
  }
  return { ok: problems.length === 0, problems };
}

// ==========================================================================
// phase 1: analyze
// ==========================================================================
export async function analyzeRequirement(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(AnalyzeRequirementSchema, rawInput);

  if (!input.diagram_type) {
    return {
      status: 'need_type',
      message: 'Choose a diagram_type, then call analyze_requirement again with nodes/edges built from that type\'s vocabulary.',
      available_types: typeMenu(),
    };
  }

  let spec: TypeSpec;
  try {
    spec = getTypeSpec(input.diagram_type);
  } catch (e) {
    return {
      status: 'error',
      message: e instanceof Error ? e.message : String(e),
      available_types: allSpecs().map((s) => s.key),
    };
  }

  const analysis = {
    diagram_type: input.diagram_type,
    title: input.title,
    requirement: input.requirement,
    rationale: input.rationale,
    nodes: input.nodes ?? [],
    edges: input.edges ?? [],
    page: { width_in: 8.5, height_in: 11.0, orientation: 'portrait' as const },
  };
  const diagram = diagramFromDict(analysis);
  const problems = validateStructure(diagram, allowedKinds(spec), spec.vocabulary);
  if (problems.length > 0) {
    return { status: 'invalid', problems, analysis };
  }

  const artifact = writeArtifact('analysis.json', analysis);
  return {
    status: 'ok',
    diagram_type: input.diagram_type,
    node_count: analysis.nodes.length,
    edge_count: analysis.edges.length,
    artifact,
    analysis,
    next: 'Call plan_diagram(spec=<this analysis>) to lay it out.',
  };
}

// ==========================================================================
// phase 2: plan
// ==========================================================================
export async function planDiagram(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(PlanDiagramSchema, rawInput);

  let diagram: Diagram;
  let typeSpec: TypeSpec;
  try {
    diagram = diagramFromDict(input.spec);
    typeSpec = getTypeSpec(diagram.diagram_type);
  } catch (e) {
    return { status: 'error', message: `could not parse spec: ${e instanceof Error ? e.message : String(e)}` };
  }

  const struct = validateStructure(diagram, allowedKinds(typeSpec), typeSpec.vocabulary);
  if (struct.length > 0) {
    return { status: 'invalid', problems: struct };
  }

  layout(diagram, typeSpec);
  const geom = validateGeometry(diagram);
  const positioned = diagramToDict(diagram);
  writeArtifact('plan.json', positioned);

  const ranks = new Set(diagram.nodes.map((n) => Math.round(n.y!)));
  const summary =
    `${typeSpec.friendly}: ${diagram.nodes.length} nodes across ${ranks.size} rows, ` +
    `${diagram.edges.length} edges routed.`;

  return {
    status: geom.length === 0 ? 'ok' : 'warnings',
    summary,
    problems: geom,
    spec: positioned,
    next: 'Call design_diagram(spec=<this spec>, out_basename=...) to render.',
  };
}

// ==========================================================================
// phase 3: design
// ==========================================================================
export async function designDiagram(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(DesignDiagramSchema, rawInput);

  let diagram: Diagram;
  let typeSpec: TypeSpec;
  try {
    diagram = diagramFromDict(input.spec);
    typeSpec = getTypeSpec(diagram.diagram_type);
  } catch (e) {
    return { status: 'error', message: `could not parse spec: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (diagram.nodes.some((n) => n.x === undefined || n.y === undefined)) {
    layout(diagram, typeSpec);
  }

  const outDir = normalizePath(input.out_dir ?? process.cwd());
  ensureDirectory(outDir);
  // path.basename strips any directory components a caller might sneak
  // into out_basename, so design_diagram can only ever write inside outDir.
  const baseName = path.basename(input.out_basename || 'diagram');
  const outVsdx = path.join(outDir, `${baseName}.vsdx`);
  const outPng = path.join(outDir, `${baseName}.png`);

  const engine = await getEngine();
  const res = resolveStencil(typeSpec, engine.app);

  if (res.status === 'needs_download' && !input.allow_primitive_fallback) {
    return {
      status: 'needs_download',
      message: res.message,
      missing_masters: res.missing_masters,
      hint: 'Ask the user to install the stencil (open the template once in Visio) OR re-call with allow_primitive_fallback=true.',
    };
  }

  engine.log = [];
  const out = await engine.render(diagram, typeSpec, res.stencil_path, outVsdx, outPng, input.png_dpi);
  return {
    status: 'ok',
    vsdx: out.vsdx,
    png: out.png,
    stencil: res.stencil_path,
    stencil_status: res.status,
    log: out.log,
  };
}

// ==========================================================================
// tool definitions (merged into mcp/tools.ts's TOOLS array)
// ==========================================================================
export const DIAGRAM_TOOL_DEFS = [
  {
    name: 'list_diagram_types',
    description:
      'List every diagram type this server can build (currently UML Activity and Basic Flowchart), with a one-line description and the element-kind vocabulary each type allows. Use this to choose a type when the requirement does not name one.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_type_vocabulary',
    description:
      'Return the full element vocabulary for one diagram type: each kind\'s Visio master, default size (px @96dpi), and default styling. Use this to build nodes with valid "kind" values for the chosen type.',
    inputSchema: {
      type: 'object',
      properties: {
        diagram_type: { type: 'string', description: 'Diagram type key, e.g. "activity" or "flowchart".' },
      },
      required: ['diagram_type'],
    },
  },
  {
    name: 'resolve_stencil',
    description:
      'Resolve which installed Visio stencil supplies a diagram type\'s masters (discovery-first: running docs -> candidate files -> master index). Returns status "resolved" (with the stencil path) or "needs_download" when the stencil is not installed.',
    inputSchema: {
      type: 'object',
      properties: {
        diagram_type: { type: 'string', description: 'Diagram type key, e.g. "activity" or "flowchart".' },
      },
      required: ['diagram_type'],
    },
  },
  {
    name: 'validate_spec',
    description:
      'Validate a diagram spec (an IR object with diagram_type/nodes/edges). Runs vocabulary/structure checks and, if nodes are positioned, geometry checks (on-page, no overlaps). Returns { ok, problems }.',
    inputSchema: {
      type: 'object',
      properties: {
        spec: { type: 'object', description: 'A diagram IR object (see the diagram_from_requirement prompt for the shape).' },
      },
      required: ['spec'],
    },
  },
  {
    name: 'analyze_requirement',
    description:
      'PHASE 1 of diagram generation. You (the calling model) read the requirement, decide the diagram type, and extract the elements, then call this to validate the graph against that type\'s vocabulary (rejecting mixed element types) and get back a normalized analysis to pass into plan_diagram.',
    inputSchema: {
      type: 'object',
      properties: {
        diagram_type: { type: 'string', description: 'Chosen type key. Omit to get the type menu back instead.' },
        nodes: { type: 'array', items: { type: 'object' }, description: '[{id, kind, label}] -- kind must be in the chosen type\'s vocabulary.' },
        edges: { type: 'array', items: { type: 'object' }, description: '[{source, target, label?}] -- label is a guard like "[yes]".' },
        requirement: { type: 'string', description: 'The original plain-language requirement, for the saved artifact.' },
        title: { type: 'string', description: 'Diagram title.' },
        rationale: { type: 'string', description: 'Why this diagram type/structure was chosen.' },
      },
      required: [],
    },
  },
  {
    name: 'plan_diagram',
    description:
      'PHASE 2 of diagram generation. Takes the analysis (or any IR spec) and computes a concrete, positioned layout: ranks/rows, orthogonal edge routing through empty corridors, guard-label placement. Explicit x/y on any node or explicit edge waypoints are preserved (manual override).',
    inputSchema: {
      type: 'object',
      properties: {
        spec: { type: 'object', description: 'The analysis from analyze_requirement, or any diagram IR object.' },
      },
      required: ['spec'],
    },
  },
  {
    name: 'design_diagram',
    description:
      'PHASE 3 of diagram generation. Renders the positioned spec in Visio and saves <out_basename>.vsdx plus <out_basename>.png. Resolves the diagram type\'s stencil first; if it is not installed this returns status "needs_download" and renders nothing unless allow_primitive_fallback=true. Visio stays open and visible.',
    inputSchema: {
      type: 'object',
      properties: {
        spec: { type: 'object', description: 'The positioned spec from plan_diagram.' },
        out_basename: { type: 'string', description: 'Output file base name (no extension). Default: "diagram".' },
        out_dir: { type: 'string', description: 'Output directory. Default: current working directory.' },
        png_dpi: { type: 'integer', description: 'PNG export resolution. Default: 150.' },
        allow_primitive_fallback: { type: 'boolean', description: 'Draw with primitives if the stencil is not installed. Default: false.' },
      },
      required: ['spec'],
    },
  },
] as const;

export async function handleDiagramTool(toolName: string, rawInput: unknown): Promise<Record<string, unknown> | null> {
  switch (toolName) {
    case 'list_diagram_types':
      return listDiagramTypes(rawInput);
    case 'get_type_vocabulary':
      return getTypeVocabulary(rawInput);
    case 'resolve_stencil':
      return resolveStencilTool(rawInput);
    case 'validate_spec':
      return validateSpecTool(rawInput);
    case 'analyze_requirement':
      return analyzeRequirement(rawInput);
    case 'plan_diagram':
      return planDiagram(rawInput);
    case 'design_diagram':
      return designDiagram(rawInput);
    default:
      return null;
  }
}

export const DIAGRAM_FROM_REQUIREMENT_PROMPT = (requirement: string): string =>
  [
    'Build a Microsoft Visio diagram from this requirement:',
    '',
    requirement,
    '',
    'Follow these phases using the visio-diagram tools, and show me the result of each phase:',
    '1. ANALYZE: If the requirement names a diagram type, use it; otherwise call list_diagram_types and pick the best fit, explaining why. Then extract nodes and edges using ONLY that type\'s vocabulary (get_type_vocabulary) and call analyze_requirement. Guards/conditions go on edges as bracketed labels (e.g. [yes]), never inside a node.',
    '2. PLAN: Call plan_diagram with the analysis. Review the layout summary and fix any reported problems.',
    '3. DESIGN: Call resolve_stencil for the type. If it reports needs_download, STOP and ask me before installing anything. Otherwise call design_diagram, then open the PNG and verify it visually.',
  ].join('\n');

logger.debug('Diagram tools loaded', { count: DIAGRAM_TOOL_DEFS.length });
