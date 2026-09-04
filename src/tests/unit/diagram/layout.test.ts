/**
 * Unit tests for the layered auto-layout engine.
 */

import { diagramFromDict, validateGeometry, validateStructure } from '../../../diagram/ir';
import { layout } from '../../../diagram/layout/layered';
import { get, allowedKinds } from '../../../diagram/types/registry';
import '../../../diagram/types/index';

const ACTIVITY = get('activity');

describe('layout - simple chain', () => {
  const d = diagramFromDict({
    diagram_type: 'activity',
    nodes: [
      { id: 'i', kind: 'initial' },
      { id: 'a', kind: 'action', label: 'Do it' },
      { id: 'f', kind: 'final' },
    ],
    edges: [
      { source: 'i', target: 'a' },
      { source: 'a', target: 'f' },
    ],
  });
  layout(d, ACTIVITY);

  it('fills in default sizes from the vocabulary', () => {
    const initial = d.nodes.find((n) => n.id === 'i')!;
    expect(initial.w).toBe(ACTIVITY.vocabulary.initial.default_w);
    expect(initial.h).toBe(ACTIVITY.vocabulary.initial.default_h);
  });

  it('positions nodes in increasing rank order (top to bottom)', () => {
    const [i, a, f] = ['i', 'a', 'f'].map((id) => d.nodes.find((n) => n.id === id)!);
    expect(i.y!).toBeLessThan(a.y!);
    expect(a.y!).toBeLessThan(f.y!);
  });

  it('produces a fully valid, non-overlapping, on-page geometry', () => {
    expect(validateGeometry(d)).toEqual([]);
  });

  it('routes each edge with at least a start and end waypoint', () => {
    for (const e of d.edges) {
      expect(e.waypoints.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('layout - branching decision', () => {
  const d = diagramFromDict({
    diagram_type: 'activity',
    nodes: [
      { id: 'i', kind: 'initial' },
      { id: 'dec', kind: 'decision', label: 'OK?' },
      { id: 'yes', kind: 'action', label: 'Yes path' },
      { id: 'no', kind: 'action', label: 'No path' },
      { id: 'm', kind: 'merge' },
      { id: 'f', kind: 'final' },
    ],
    edges: [
      { source: 'i', target: 'dec' },
      { source: 'dec', target: 'yes', label: '[yes]' },
      { source: 'dec', target: 'no', label: '[no]' },
      { source: 'yes', target: 'm' },
      { source: 'no', target: 'm' },
      { source: 'm', target: 'f' },
    ],
  });

  it('has a valid structure (merge satisfies min_in_degree)', () => {
    expect(validateStructure(d, allowedKinds(ACTIVITY), ACTIVITY.vocabulary)).toEqual([]);
  });

  layout(d, ACTIVITY);

  it('places both branches in the same rank (row)', () => {
    const yes = d.nodes.find((n) => n.id === 'yes')!;
    const no = d.nodes.find((n) => n.id === 'no')!;
    expect(yes.y).toBe(no.y);
    expect(yes.x).not.toBe(no.x);
  });

  it('produces a fully valid, non-overlapping, on-page geometry', () => {
    expect(validateGeometry(d)).toEqual([]);
  });

  it('sets a label position for labelled edges', () => {
    const decToYes = d.edges.find((e) => e.source === 'dec' && e.target === 'yes')!;
    expect(decToYes.label_pos).toBeDefined();
  });
});

describe('layout - back edge / loop', () => {
  const d = diagramFromDict({
    diagram_type: 'activity',
    nodes: [
      { id: 'i', kind: 'initial' },
      { id: 'a1', kind: 'action', label: 'Attempt' },
      { id: 'dec', kind: 'decision', label: 'Retry?' },
      { id: 'f', kind: 'final' },
    ],
    edges: [
      { source: 'i', target: 'a1' },
      { source: 'a1', target: 'dec' },
      { source: 'dec', target: 'a1', label: '[retry]' }, // back edge
      { source: 'dec', target: 'f', label: '[done]' },
    ],
  });
  layout(d, ACTIVITY);

  it('does not push the loop target rank downward (a1 stays above dec)', () => {
    const a1 = d.nodes.find((n) => n.id === 'a1')!;
    const dec = d.nodes.find((n) => n.id === 'dec')!;
    expect(a1.y!).toBeLessThan(dec.y!);
  });

  it('routes the back edge through a side lane (more than 2 waypoints)', () => {
    const backEdge = d.edges.find((e) => e.source === 'dec' && e.target === 'a1')!;
    expect(backEdge.waypoints.length).toBeGreaterThan(2);
  });

  it('produces a fully valid, non-overlapping, on-page geometry', () => {
    expect(validateGeometry(d)).toEqual([]);
  });
});

describe('layout - manual coordinate override', () => {
  it('preserves explicit x/y on a node instead of auto-placing it', () => {
    const d = diagramFromDict({
      diagram_type: 'activity',
      nodes: [
        { id: 'i', kind: 'initial', x: 500, y: 500 },
        { id: 'f', kind: 'final' },
      ],
      edges: [{ source: 'i', target: 'f' }],
    });
    layout(d, ACTIVITY);
    const initial = d.nodes.find((n) => n.id === 'i')!;
    expect(initial.x).toBe(500);
    expect(initial.y).toBe(500);
  });
});
