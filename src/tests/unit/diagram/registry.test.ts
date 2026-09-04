/**
 * Unit tests for the diagram-type registry and builtin types.
 */

import { get, has, allSpecs, allowedKinds } from '../../../diagram/types/registry';
import '../../../diagram/types/index';

describe('registry', () => {
  it('registers the activity and flowchart builtin types', () => {
    expect(has('activity')).toBe(true);
    expect(has('flowchart')).toBe(true);
    expect(has('nonexistent')).toBe(false);
  });

  it('throws a helpful error for an unknown type', () => {
    expect(() => get('nonexistent')).toThrow(/unknown diagram_type/);
  });

  it('lists all registered types', () => {
    const keys = allSpecs().map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['activity', 'flowchart']));
  });

  describe('activity vocabulary', () => {
    const spec = get('activity');

    it('exposes the expected kinds', () => {
      expect(allowedKinds(spec)).toEqual(
        new Set(['action', 'object_state', 'decision', 'merge', 'initial', 'final', 'fork', 'join']),
      );
    });

    it('marks merge/join/fork with degree guardrails', () => {
      expect(spec.vocabulary.merge.min_in_degree).toBe(2);
      expect(spec.vocabulary.fork.min_out_degree).toBe(2);
      expect(spec.vocabulary.join.min_in_degree).toBe(2);
    });

    it('uses "initial" as the layout start kind', () => {
      expect(spec.start_kinds).toEqual(['initial']);
    });
  });

  describe('flowchart vocabulary', () => {
    const spec = get('flowchart');

    it('exposes the expected kinds', () => {
      expect(allowedKinds(spec)).toEqual(
        new Set(['start', 'end', 'process', 'decision', 'io', 'document']),
      );
    });

    it('uses "start" as the layout start kind', () => {
      expect(spec.start_kinds).toEqual(['start']);
    });
  });
});
