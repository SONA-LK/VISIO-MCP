/**
 * Zod schemas for the diagram-generation tools (analyze -> plan -> design).
 *
 * Field names deliberately match the visio-diagram-mcp reference IR
 * contract (snake_case: diagram_type, width_in, source_side, ...) -- see
 * src/diagram/ir.ts for why. These schemas do lightweight shape validation
 * only; the real structural/geometry/vocabulary rules live in
 * src/diagram/ir.ts's validateStructure/validateGeometry.
 */

import { z } from 'zod';

export const PageSpecSchema = z.object({
  width_in: z.number().positive().optional(),
  height_in: z.number().positive().optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
});

export const NodeSpecSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
  style: z.record(z.unknown()).optional(),
});

export const EdgeSpecSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
  routing: z.enum(['orthogonal', 'straight']).optional(),
  waypoints: z.array(z.tuple([z.number(), z.number()])).optional(),
  source_side: z.string().optional(),
  target_side: z.string().optional(),
  label_pos: z.tuple([z.number(), z.number()]).optional(),
  flow: z.enum(['control', 'object']).optional(),
});

export const DiagramSpecSchema = z.object({
  diagram_type: z.string().min(1),
  title: z.string().optional(),
  page: PageSpecSchema.optional(),
  nodes: z.array(NodeSpecSchema).optional(),
  edges: z.array(EdgeSpecSchema).optional(),
});

// ── Tool inputs ──────────────────────────────────────────────────────────

export const ListDiagramTypesSchema = z.object({});

export const GetTypeVocabularySchema = z.object({
  diagram_type: z.string().min(1),
});

export const ResolveStencilSchema = z.object({
  diagram_type: z.string().min(1),
});

export const ValidateSpecSchema = z.object({
  spec: z.record(z.unknown()),
});

export const AnalyzeRequirementSchema = z.object({
  diagram_type: z.string().optional(),
  nodes: z.array(NodeSpecSchema).optional(),
  edges: z.array(EdgeSpecSchema).optional(),
  requirement: z.string().optional().default(''),
  title: z.string().optional().default(''),
  rationale: z.string().optional().default(''),
});

export const PlanDiagramSchema = z.object({
  spec: z.record(z.unknown()),
});

export const DesignDiagramSchema = z.object({
  spec: z.record(z.unknown()),
  out_basename: z.string().optional().default('diagram'),
  out_dir: z.string().optional(),
  png_dpi: z.number().int().positive().optional().default(150),
  allow_primitive_fallback: z.boolean().optional().default(false),
});
