/**
 * Unit tests for the engine's pure coordinate/color helpers.
 *
 * The rest of engine.ts talks to live Visio COM objects and is exercised by
 * a manual smoke test (see the diagram tools' documentation) rather than
 * unit tests, consistent with the rest of src/visio/* in this repo.
 */

import { pxX, pxY, hexToRgb, VisioEngine } from '../../../diagram/engine';

describe('pxX / pxY', () => {
  it('converts px @96dpi to inches', () => {
    expect(pxX(96)).toBe(1);
    expect(pxX(48)).toBe(0.5);
  });

  it('flips the y-axis (top-left px -> bottom-left inches)', () => {
    // page is 11in tall; a point 96px (1in) from the top is 10in from the
    // bottom in Visio's coordinate system.
    expect(pxY(96, 11)).toBe(10);
    expect(pxY(0, 11)).toBe(11);
  });
});

describe('hexToRgb', () => {
  it('parses a hex color into its RGB components', () => {
    expect(hexToRgb('#FF0000')).toEqual([255, 0, 0]);
    expect(hexToRgb('#00FF00')).toEqual([0, 255, 0]);
    expect(hexToRgb('#1A1414')).toEqual([26, 20, 20]);
  });
});

describe('VisioEngine.sideUV', () => {
  it('maps a downward exit segment to the bottom-center connection point', () => {
    expect(VisioEngine.sideUV(0, 10, false)).toEqual([0.5, 0.0]);
  });

  it('maps a downward segment entering a shape to its top-center point', () => {
    expect(VisioEngine.sideUV(0, 10, true)).toEqual([0.5, 1.0]);
  });

  it('maps a rightward exit segment to the right-center connection point', () => {
    expect(VisioEngine.sideUV(10, 0, false)).toEqual([1.0, 0.5]);
  });

  it('maps a leftward exit segment to the left-center connection point', () => {
    expect(VisioEngine.sideUV(-10, 0, false)).toEqual([0.0, 0.5]);
  });

  it('falls back to shape center for a diagonal/degenerate segment', () => {
    expect(VisioEngine.sideUV(5, 5, false)).toEqual([0.5, 0.5]);
  });
});
