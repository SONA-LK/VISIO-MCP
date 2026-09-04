/**
 * UML Activity diagram type.
 *
 * Ported from visio-diagram-mcp's proven reference: the real UML Activity
 * stencil is UACTME_U.vssx (masters: Action, Decision, Merge Node, Initial
 * node, Final node, Fork node, Join node). Styles/sizes match what was
 * verified visually in that project.
 */

import { TypeSpec, kindSpec, edgeStyle, register } from './registry';

export const ACTIVITY: TypeSpec = {
  key: 'activity',
  friendly: 'UML Activity',
  description:
    'Workflow/behavior: actions, decisions, merges, fork/join, ' +
    'initial/final nodes, guarded transitions.',
  stencils: ['UACTME_U.vssx'],
  layout: 'layered',
  start_kinds: ['initial'],
  edge_style: edgeStyle({
    line: '#000000',
    line_weight_pt: 0.75,
    label_size_pt: 9.0,
    label_color: '#000000',
    gap_in: 0.03,
  }),
  // Plain black-on-white by default -- no accent palette unless the
  // caller's requirement explicitly asks for colors (then set it per-node
  // via node.style={fill, line}). Initial/final/fork/join stay solid
  // black: that's required UML control-node notation, not decoration.
  vocabulary: {
    action: kindSpec({
      // The installed UML Activity stencil's "Action" master is
      // geometrically an oval (not a rectangle) -- setting Rounding on it
      // is a silent no-op. There is no rounded-rectangle master anywhere
      // in this stencil, so force the primitive path: draw a real
      // rectangle + Rounding cell instead of the master. `master` is kept
      // for documentation/vocabulary purposes even though it's bypassed.
      master: 'Action', default_w: 180, default_h: 44,
      fill: '#FFFFFF', line: '#000000', line_weight_pt: 0.75,
      text_size_pt: 10, rounding_in: 0.08, primitive: 'rounded_rect',
      force_primitive: true,
    }),
    object_state: kindSpec({
      // UML object node: a data object/artifact flowing through the
      // activity, annotated with its state (e.g. a "Ticket" object shown
      // as "[Open]" then later "[Closed]"). No master anywhere in the
      // installed UML Activity stencil for this, so it's a primitive rect
      // with a horizontal divider -- node.label should carry
      // "Object Name\n[State]" (name above the line, state below).
      default_w: 160, default_h: 60,
      fill: '#FFFFFF', line: '#000000', line_weight_pt: 0.75,
      text_size_pt: 10, primitive: 'divided_rect', force_primitive: true,
    }),
    decision: kindSpec({
      master: 'Decision', default_w: 140, default_h: 76,
      fill: '#FFFFFF', line: '#000000', line_weight_pt: 0.75,
      text_size_pt: 9, center_text: true, primitive: 'diamond',
    }),
    merge: kindSpec({
      master: 'Merge Node', default_w: 36, default_h: 36,
      fill: '#FFFFFF', line: '#000000', line_weight_pt: 0.75,
      text: false, primitive: 'diamond', min_in_degree: 2,
    }),
    initial: kindSpec({
      master: 'Initial node', default_w: 21, default_h: 21,
      fill: '#1A1414', line: '#1A1414', text: false, primitive: 'circle',
    }),
    final: kindSpec({
      master: 'Final node', default_w: 33, default_h: 33,
      fill: '#1A1414', line: '#1A1414', text: false, primitive: 'double_circle',
    }),
    fork: kindSpec({
      master: 'Fork node', default_w: 190, default_h: 6,
      fill: '#1A1414', line: '#1A1414', text: false, primitive: 'bar',
      min_out_degree: 2,
    }),
    join: kindSpec({
      master: 'Join node', default_w: 190, default_h: 6,
      fill: '#1A1414', line: '#1A1414', text: false, primitive: 'bar',
      min_in_degree: 2,
    }),
  },
};

register(ACTIVITY);
