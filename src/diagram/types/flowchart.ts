/**
 * Basic Flowchart diagram type.
 *
 * Ported from visio-diagram-mcp: uses the installed Basic Flowchart Shapes
 * stencil (BASFLO_U.vssx). Distinct vocabulary from `activity` -- validation
 * forbids mixing the two.
 */

import { TypeSpec, kindSpec, edgeStyle, register } from './registry';

export const FLOWCHART: TypeSpec = {
  key: 'flowchart',
  friendly: 'Basic Flowchart',
  description:
    'Process flow: start/end terminators, process steps, decisions, ' +
    'input/output, on-page connectors.',
  stencils: ['BASFLO_U.vssx'],
  layout: 'layered',
  start_kinds: ['start'],
  edge_style: edgeStyle({
    line: '#000000', line_weight_pt: 0.75,
    label_size_pt: 9.0, label_color: '#000000', gap_in: 0.03,
  }),
  // Plain black-on-white by default -- see activity.ts for why (no accent
  // palette unless the requirement explicitly asks for colors; then apply
  // it per-node via node.style={fill, line}).
  vocabulary: {
    start: kindSpec({
      master: 'Start/End', default_w: 150, default_h: 44,
      fill: '#FFFFFF', line: '#000000', text_size_pt: 10,
      primitive: 'rounded_rect',
    }),
    end: kindSpec({
      master: 'Start/End', default_w: 150, default_h: 44,
      fill: '#FFFFFF', line: '#000000', text_size_pt: 10,
      primitive: 'rounded_rect',
    }),
    process: kindSpec({
      master: 'Process', default_w: 170, default_h: 44,
      fill: '#FFFFFF', line: '#000000', text_size_pt: 10, primitive: 'rect',
    }),
    decision: kindSpec({
      master: 'Decision', default_w: 150, default_h: 80,
      fill: '#FFFFFF', line: '#000000', text_size_pt: 9,
      center_text: true, primitive: 'diamond',
    }),
    io: kindSpec({
      master: 'Data', default_w: 160, default_h: 44,
      fill: '#FFFFFF', line: '#000000', text_size_pt: 10, primitive: 'rect',
    }),
    document: kindSpec({
      master: 'Document', default_w: 160, default_h: 48,
      fill: '#FFFFFF', line: '#000000', text_size_pt: 10, primitive: 'rect',
    }),
  },
};

register(FLOWCHART);
