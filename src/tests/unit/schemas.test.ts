/**
 * Unit tests for MCP schema validation
 */

import {
  AddShapeSchema,
  ConnectShapesSchema,
  SaveDocumentSchema,
  ExportDocumentSchema,
  OpenDocumentSchema,
  MoveShapeSchema,
  ResizeShapeSchema,
  DeleteShapeSchema,
  SetShapeTextSchema,
} from '../../mcp/schemas';

describe('AddShapeSchema', () => {
  it('accepts a valid rectangle input', () => {
    const result = AddShapeSchema.safeParse({
      type: 'rectangle',
      x: 1.0,
      y: 2.0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts shape with all optional fields', () => {
    const result = AddShapeSchema.safeParse({
      type: 'ellipse',
      x: 0,
      y: 0,
      width: 2.5,
      height: 1.5,
      text: 'My Ellipse',
      style: { fillColor: '#FF0000', lineWeight: 2 },
      pageIndex: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required type', () => {
    const result = AddShapeSchema.safeParse({ x: 1, y: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid shape type', () => {
    const result = AddShapeSchema.safeParse({ type: 'hexagon', x: 1, y: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects negative width', () => {
    const result = AddShapeSchema.safeParse({ type: 'rectangle', x: 1, y: 1, width: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid hex color', () => {
    const result = AddShapeSchema.safeParse({
      type: 'rectangle',
      x: 1,
      y: 1,
      style: { fillColor: 'red' }, // not a hex code
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid shape types', () => {
    const validTypes = [
      'rectangle', 'rounded-rectangle', 'ellipse', 'diamond',
      'triangle', 'line', 'text', 'server', 'database', 'router',
      'switch', 'firewall', 'computer', 'cloud', 'process',
      'decision', 'document', 'start-end',
    ];

    for (const type of validTypes) {
      const result = AddShapeSchema.safeParse({ type, x: 1, y: 1 });
      expect(result.success).toBe(true);
    }
  });
});

describe('ConnectShapesSchema', () => {
  it('accepts valid connection input', () => {
    const result = ConnectShapesSchema.safeParse({
      fromShapeId: 'Sheet.1',
      toShapeId: 'Sheet.2',
    });
    expect(result.success).toBe(true);
  });

  it('accepts connection with optional text and pageIndex', () => {
    const result = ConnectShapesSchema.safeParse({
      fromShapeId: 'Sheet.1',
      toShapeId: 'Sheet.2',
      text: 'depends on',
      pageIndex: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing toShapeId', () => {
    const result = ConnectShapesSchema.safeParse({ fromShapeId: 'Sheet.1' });
    expect(result.success).toBe(false);
  });
});

describe('SaveDocumentSchema', () => {
  it('accepts empty input (save in place)', () => {
    const result = SaveDocumentSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts filePath with overwrite', () => {
    const result = SaveDocumentSchema.safeParse({
      filePath: 'C:\\test\\diagram.vsdx',
      overwrite: true,
    });
    expect(result.success).toBe(true);
  });

  it('defaults overwrite to false', () => {
    const result = SaveDocumentSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.overwrite).toBe(false);
    }
  });
});

describe('ExportDocumentSchema', () => {
  it('accepts valid PNG export', () => {
    const result = ExportDocumentSchema.safeParse({
      outputPath: 'C:\\output\\diagram.png',
      format: 'png',
    });
    expect(result.success).toBe(true);
  });

  it('accepts PDF with page index', () => {
    const result = ExportDocumentSchema.safeParse({
      outputPath: 'C:\\output\\diagram.pdf',
      format: 'pdf',
      pageIndex: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid format', () => {
    const result = ExportDocumentSchema.safeParse({
      outputPath: 'C:\\out.bmp',
      format: 'bmp',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing outputPath', () => {
    const result = ExportDocumentSchema.safeParse({ format: 'pdf' });
    expect(result.success).toBe(false);
  });
});

describe('MoveShapeSchema', () => {
  it('accepts valid move input', () => {
    const result = MoveShapeSchema.safeParse({
      shapeId: 'Sheet.5',
      x: 2.0,
      y: 3.0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing shapeId', () => {
    const result = MoveShapeSchema.safeParse({ x: 1, y: 1 });
    expect(result.success).toBe(false);
  });
});

describe('ResizeShapeSchema', () => {
  it('accepts valid resize', () => {
    const result = ResizeShapeSchema.safeParse({
      shapeId: 'Sheet.3',
      width: 3.0,
      height: 2.0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects zero width', () => {
    const result = ResizeShapeSchema.safeParse({
      shapeId: 'Sheet.3',
      width: 0,
      height: 2.0,
    });
    expect(result.success).toBe(false);
  });
});

describe('SetShapeTextSchema', () => {
  it('accepts valid set text input', () => {
    const result = SetShapeTextSchema.safeParse({
      shapeId: 'Sheet.1',
      text: 'Hello World',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty string text', () => {
    const result = SetShapeTextSchema.safeParse({
      shapeId: 'Sheet.1',
      text: '',
    });
    expect(result.success).toBe(true);
  });
});

describe('OpenDocumentSchema', () => {
  it('accepts valid file path', () => {
    const result = OpenDocumentSchema.safeParse({
      filePath: 'C:\\diagrams\\network.vsdx',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty file path', () => {
    const result = OpenDocumentSchema.safeParse({ filePath: '' });
    // Schema has min(1) so empty string is rejected at schema level
    expect(result.success).toBe(false);
  });
});
