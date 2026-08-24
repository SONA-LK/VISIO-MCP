/**
 * Windows Integration Tests for VisioMCP
 *
 * These tests REQUIRE:
 *   - Windows OS
 *   - Microsoft Visio installed
 *   - Run with: npm run test:integration
 *
 * They test the real COM automation path against a live Visio instance.
 * Do NOT mock Visio for these tests.
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Skip the entire suite if not on Windows
const IS_WINDOWS = process.platform === 'win32';

const describeWindows = IS_WINDOWS ? describe : describe.skip;

describeWindows('Visio Integration Tests (Windows only)', () => {
  let tempDir: string;
  let testVsdxPath: string;

  beforeAll(() => {
    tempDir = path.join(os.tmpdir(), 'VisioMCP_IntegrationTests');
    fs.mkdirSync(tempDir, { recursive: true });
    testVsdxPath = path.join(tempDir, 'test_diagram.vsdx');
  });

  afterAll(() => {
    // Clean up temp files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('VisioApplication', () => {
    it('can detect whether Visio is running', async () => {
      const { visioApp } = await import('../../visio/application');
      const running = visioApp.isRunning();
      // Just verify it returns a boolean without throwing
      expect(typeof running).toBe('boolean');
    });

    it('can connect to or start Visio', async () => {
      const { visioApp } = await import('../../visio/application');
      await expect(visioApp.connect()).resolves.not.toThrow();
    });

    it('returns a valid version string', async () => {
      const { visioApp } = await import('../../visio/application');
      await visioApp.ensureConnected();
      const version = visioApp.getVersion();
      expect(typeof version).toBe('string');
      expect(version.length).toBeGreaterThan(0);
    });
  });

  describe('First Milestone: Hello World flow', () => {
    /**
     * MILESTONE: Prove this complete flow works:
     * MCP client → VisioMCP → COM → Visio → create document → create rectangle → set "Hello World" → save .vsdx
     */

    it('Step 1: create a new document', async () => {
      const { visioDocument } = await import('../../visio/document');
      await expect(visioDocument.create()).resolves.not.toThrow();
    });

    it('Step 2: add a rectangle shape', async () => {
      const { visioShapes } = await import('../../visio/shapes');
      const result = await visioShapes.addShape({
        type: 'rectangle',
        x: 1.0,
        y: 1.0,
        width: 3.0,
        height: 1.5,
      });
      expect(result.shapeId).toMatch(/^Sheet\.\d+$/);
      expect(result.width).toBe(3.0);
      expect(result.height).toBe(1.5);
    });

    it('Step 3: set shape text to "Hello World"', async () => {
      const { visioShapes } = await import('../../visio/shapes');
      const shapes = await visioShapes.getShapes(0);
      expect(shapes.length).toBeGreaterThan(0);
      const shapeId = shapes[0].id;
      await expect(
        visioShapes.setShapeText(shapeId, 'Hello World', 0),
      ).resolves.not.toThrow();
    });

    it('Step 4: save the document as .vsdx', async () => {
      const { visioDocument } = await import('../../visio/document');
      await expect(
        visioDocument.saveAs(testVsdxPath, true),
      ).resolves.not.toThrow();
      expect(fs.existsSync(testVsdxPath)).toBe(true);
    });

    it('Step 5: verify saved file exists and is non-empty', () => {
      const stat = fs.statSync(testVsdxPath);
      expect(stat.size).toBeGreaterThan(0);
    });

    it('Step 6: close the document', async () => {
      const { visioDocument } = await import('../../visio/document');
      await expect(visioDocument.close(false)).resolves.not.toThrow();
    });

    it('Step 7: reopen the saved file', async () => {
      const { visioDocument } = await import('../../visio/document');
      const info = await visioDocument.open(testVsdxPath);
      expect(info.name).toContain('test_diagram');
    });

    it('Step 8: verify shape with Hello World text exists', async () => {
      const { visioShapes } = await import('../../visio/shapes');
      const shapes = await visioShapes.getShapes(0);
      const helloShape = shapes.find(s => s.text === 'Hello World');
      expect(helloShape).toBeDefined();
    });

    it('Step 9: clean up — close document', async () => {
      const { visioDocument } = await import('../../visio/document');
      await expect(visioDocument.close(false)).resolves.not.toThrow();
    });
  });

  describe('Shape Operations', () => {
    beforeEach(async () => {
      const { visioDocument } = await import('../../visio/document');
      await visioDocument.create();
    });

    afterEach(async () => {
      const { visioDocument } = await import('../../visio/document');
      try { await visioDocument.close(false); } catch { /* ignore */ }
    });

    it('can add multiple shape types', async () => {
      const { visioShapes } = await import('../../visio/shapes');
      const types = ['rectangle', 'ellipse', 'diamond', 'triangle'] as const;

      for (let i = 0; i < types.length; i++) {
        const result = await visioShapes.addShape({
          type: types[i],
          x: i * 3,
          y: 1.0,
        });
        expect(result.shapeId).toMatch(/^Sheet\.\d+$/);
      }
    });

    it('can move a shape', async () => {
      const { visioShapes } = await import('../../visio/shapes');
      const added = await visioShapes.addShape({ type: 'rectangle', x: 1, y: 1 });
      await expect(
        visioShapes.moveShape(added.shapeId, 3.0, 4.0),
      ).resolves.not.toThrow();
    });

    it('can resize a shape', async () => {
      const { visioShapes } = await import('../../visio/shapes');
      const added = await visioShapes.addShape({ type: 'rectangle', x: 1, y: 1 });
      await expect(
        visioShapes.resizeShape(added.shapeId, 4.0, 2.0),
      ).resolves.not.toThrow();
    });

    it('can delete a shape', async () => {
      const { visioShapes } = await import('../../visio/shapes');
      const added = await visioShapes.addShape({ type: 'rectangle', x: 1, y: 1 });
      const shapeId = added.shapeId;

      await visioShapes.deleteShape(shapeId);
      const shapes = await visioShapes.getShapes();
      const deleted = shapes.find(s => s.id === shapeId);
      expect(deleted).toBeUndefined();
    });
  });

  describe('Connector Operations', () => {
    beforeEach(async () => {
      const { visioDocument } = await import('../../visio/document');
      await visioDocument.create();
    });

    afterEach(async () => {
      const { visioDocument } = await import('../../visio/document');
      try { await visioDocument.close(false); } catch { /* ignore */ }
    });

    it('can connect two shapes', async () => {
      const { visioShapes } = await import('../../visio/shapes');
      const { visioConnectors } = await import('../../visio/connectors');

      const shape1 = await visioShapes.addShape({ type: 'rectangle', x: 1, y: 1, text: 'A' });
      const shape2 = await visioShapes.addShape({ type: 'rectangle', x: 5, y: 1, text: 'B' });

      const result = await visioConnectors.connectShapes({
        fromShapeId: shape1.shapeId,
        toShapeId: shape2.shapeId,
        text: 'connects to',
      });

      expect(result.connectorId).toMatch(/^Sheet\.\d+$/);
      expect(result.fromShapeId).toBe(shape1.shapeId);
      expect(result.toShapeId).toBe(shape2.shapeId);
    });
  });
});
