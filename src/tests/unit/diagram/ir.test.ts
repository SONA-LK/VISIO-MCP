/**
 * Unit tests for the diagram IR: parsing + structural/geometry validation.
 */

import {
  diagramFromDict,
  validateStructure,
  validateGeometry,
  pageFromDict,
} from '../../../diagram/ir';
import { kindSpec, KindSpec } from '../../../diagram/types/registry';

describe('pageFromDict', () => {
  it('applies defaults for a missing page', () => {
    const page = pageFromDict(undefined);
    expect(page).toEqual({ width_in: 8.5, height_in: 11.0, orientation: 'portrait' });
  });

  it('preserves supplied values', () => {
    const page = pageFromDict({ width_in: 11, height_in: 8.5, orientation: 'landscape' });
    expect(page).toEqual({ width_in: 11, height_in: 8.5, orientation: 'landscape' });
  });
});

describe('diagramFromDict', () => {
  it('round-trips nodes and edges', () => {
    const d = diagramFromDict({
      diagram_type: 'activity',
      title: 'Test',
      nodes: [
        { id: 'a', kind: 'initial' },
        { id: 'b', kind: 'action', label: 'Do thing', x: 10, y: 20, w: 100, h: 40 },
      ],
      edges: [{ source: 'a', target: 'b', label: '[ok]' }],
    });
    expect(d.diagram_type).toBe('activity');
    expect(d.nodes).toHaveLength(2);
    expect(d.nodes[1]).toMatchObject({ id: 'b', kind: 'action', label: 'Do thing', x: 10, y: 20, w: 100, h: 40 });
    expect(d.edges[0]).toMatchObject({ source: 'a', target: 'b', label: '[ok]', routing: 'orthogonal' });
  });
});

describe('validateStructure', () => {
  const allowed = new Set(['initial', 'action', 'final']);

  it('flags an empty diagram', () => {
    const d = diagramFromDict({ diagram_type: 'activity', nodes: [], edges: [] });
    const problems = validateStructure(d, allowed);
    expect(problems).toContain('diagram has no nodes');
  });

  it('flags a node kind outside the vocabulary', () => {
    const d = diagramFromDict({
      diagram_type: 'activity',
      nodes: [{ id: 'a', kind: 'process' }],
      edges: [],
    });
    const problems = validateStructure(d, allowed);
    expect(problems.some((p) => p.includes('not in the'))).toBe(true);
  });

  it('flags duplicate node ids', () => {
    const d = diagramFromDict({
      diagram_type: 'activity',
      nodes: [{ id: 'a', kind: 'initial' }, { id: 'a', kind: 'final' }],
      edges: [],
    });
    const problems = validateStructure(d, allowed);
    expect(problems.some((p) => p.includes('duplicate node id'))).toBe(true);
  });

  it('flags edges referencing unknown nodes', () => {
    const d = diagramFromDict({
      diagram_type: 'activity',
      nodes: [{ id: 'a', kind: 'initial' }],
      edges: [{ source: 'a', target: 'ghost' }],
    });
    const problems = validateStructure(d, allowed);
    expect(problems.some((p) => p.includes('is not a known node'))).toBe(true);
  });

  it('accepts a valid graph with no problems', () => {
    const d = diagramFromDict({
      diagram_type: 'activity',
      nodes: [{ id: 'a', kind: 'initial' }, { id: 'b', kind: 'final' }],
      edges: [{ source: 'a', target: 'b' }],
    });
    expect(validateStructure(d, allowed)).toEqual([]);
  });

  it('flags a merge node with fewer than min_in_degree incoming edges', () => {
    const vocabulary: Record<string, KindSpec> = {
      initial: kindSpec({ default_w: 20, default_h: 20 }),
      merge: kindSpec({ default_w: 36, default_h: 36, min_in_degree: 2 }),
      final: kindSpec({ default_w: 30, default_h: 30 }),
    };
    const d = diagramFromDict({
      diagram_type: 'activity',
      nodes: [
        { id: 'i', kind: 'initial' },
        { id: 'm', kind: 'merge' },
        { id: 'f', kind: 'final' },
      ],
      edges: [{ source: 'i', target: 'm' }, { source: 'm', target: 'f' }],
    });
    const problems = validateStructure(d, new Set(Object.keys(vocabulary)), vocabulary);
    expect(problems.some((p) => p.includes('needs 2+'))).toBe(true);
  });
});

describe('validateGeometry', () => {
  it('flags a node missing coordinates after layout', () => {
    const d = diagramFromDict({
      diagram_type: 'activity',
      nodes: [{ id: 'a', kind: 'initial' }],
      edges: [],
    });
    const problems = validateGeometry(d);
    expect(problems.some((p) => p.includes('not fully positioned'))).toBe(true);
  });

  it('flags a node that falls outside the page bounds', () => {
    const d = diagramFromDict({
      diagram_type: 'activity',
      page: { width_in: 8.5, height_in: 11.0, orientation: 'portrait' },
      nodes: [{ id: 'a', kind: 'initial', x: -10, y: 50, w: 20, h: 20 }],
      edges: [],
    });
    const problems = validateGeometry(d);
    expect(problems.some((p) => p.includes('falls outside the page bounds'))).toBe(true);
  });

  it('flags two overlapping node boxes', () => {
    const d = diagramFromDict({
      diagram_type: 'activity',
      nodes: [
        { id: 'a', kind: 'initial', x: 100, y: 100, w: 100, h: 40 },
        { id: 'b', kind: 'final', x: 110, y: 100, w: 100, h: 40 },
      ],
      edges: [],
    });
    const problems = validateGeometry(d);
    expect(problems.some((p) => p.includes('overlap'))).toBe(true);
  });

  it('accepts fully positioned, non-overlapping, on-page nodes', () => {
    const d = diagramFromDict({
      diagram_type: 'activity',
      page: { width_in: 8.5, height_in: 11.0, orientation: 'portrait' },
      nodes: [
        { id: 'a', kind: 'initial', x: 100, y: 100, w: 40, h: 40 },
        { id: 'b', kind: 'final', x: 100, y: 300, w: 40, h: 40 },
      ],
      edges: [],
    });
    expect(validateGeometry(d)).toEqual([]);
  });
});
