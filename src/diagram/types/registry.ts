/**
 * Diagram-type registry.
 *
 * A `TypeSpec` fully describes how one Visio diagram type is built:
 *   - `vocabulary` : allowed node kinds -> KindSpec (master name, default
 *                    style, default size in px, text handling)
 *   - `stencils`   : ordered candidate stencil filenames (US-units) to
 *                    resolve; resolution is discovery-first (see
 *                    stencils.ts) so this is a hint list, not a hard
 *                    requirement
 *   - `layout`     : which layout strategy to use ("layered" for now)
 *   - `edgeStyle`  : default connector styling
 *   - `friendly`   : human name + one-line description (for list_diagram_types)
 *
 * Adding a new diagram type = add a module that calls `register(TypeSpec)`
 * and import it from `types/index.ts`. Nothing else needs to change.
 */

/** One element kind within a diagram type. */
export interface KindSpec {
  /** Visio master name in the resolved stencil, or undefined for a kind
   * with no matching master anywhere (must set force_primitive). */
  master?: string;
  default_w: number; // px @96dpi
  default_h: number; // px
  fill?: string; // hex, or undefined to keep master/theme fill
  line?: string; // hex
  line_weight_pt: number;
  text_size_pt: number;
  text: boolean; // does this element carry a text label?
  rounding_in?: number;
  center_text: boolean; // re-pin text block to shape center (diamonds)
  /** Primitive fallback used when no stencil master is available. */
  primitive: 'rect' | 'rounded_rect' | 'diamond' | 'circle' | 'double_circle' | 'bar' | 'divided_rect';
  /** Draw with the primitive path even though a stencil master exists for
   * this kind (e.g. the installed master is geometrically wrong for this
   * notation). */
  force_primitive: boolean;
  /** Structural guardrails, checked by validateStructure. */
  min_in_degree?: number;
  min_out_degree?: number;
}

export function kindSpec(spec: Partial<KindSpec> & Pick<KindSpec, 'default_w' | 'default_h'>): KindSpec {
  return {
    master: undefined,
    fill: undefined,
    line: undefined,
    line_weight_pt: 0.75,
    text_size_pt: 10.0,
    text: true,
    rounding_in: undefined,
    center_text: false,
    primitive: 'rect',
    force_primitive: false,
    min_in_degree: undefined,
    min_out_degree: undefined,
    ...spec,
  };
}

export interface EdgeStyle {
  line: string;
  line_weight_pt: number;
  end_arrow: string; // Visio arrow index at target end
  begin_arrow: string;
  label_size_pt: number;
  label_color: string;
  gap_in: number; // visible gap between arrowhead and shape edge
}

export function edgeStyle(spec: Partial<EdgeStyle> = {}): EdgeStyle {
  return {
    line: '#444441',
    line_weight_pt: 0.75,
    end_arrow: '5',
    begin_arrow: '0',
    label_size_pt: 9.0,
    label_color: '#5F5E5A',
    gap_in: 0.03,
    ...spec,
  };
}

export interface TypeSpec {
  key: string;
  friendly: string;
  description: string;
  vocabulary: Record<string, KindSpec>;
  stencils: string[]; // candidate .vssx filenames (US units)
  layout: 'layered';
  edge_style: EdgeStyle;
  /** Start-node kinds used by layered layout to find the flow entry point. */
  start_kinds: readonly string[];
}

export function allowedKinds(spec: TypeSpec): Set<string> {
  return new Set(Object.keys(spec.vocabulary));
}

const REGISTRY = new Map<string, TypeSpec>();

export function register(spec: TypeSpec): void {
  REGISTRY.set(spec.key, spec);
}

export function get(key: string): TypeSpec {
  const spec = REGISTRY.get(key);
  if (!spec) {
    throw new Error(
      `unknown diagram_type ${JSON.stringify(key)}; known types: ${JSON.stringify(
        [...REGISTRY.keys()].sort(),
      )}`,
    );
  }
  return spec;
}

export function has(key: string): boolean {
  return REGISTRY.has(key);
}

export function allSpecs(): TypeSpec[] {
  return [...REGISTRY.values()];
}
