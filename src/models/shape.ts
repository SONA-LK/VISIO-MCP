/**
 * Shape model definitions for VisioMCP
 * These are the clean, AI-facing data structures — no COM objects exposed.
 */

export type ShapeType =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'line'
  | 'text'
  | 'server'
  | 'database'
  | 'router'
  | 'switch'
  | 'firewall'
  | 'computer'
  | 'cloud'
  | 'process'
  | 'decision'
  | 'document'
  | 'start-end';

export interface ShapePosition {
  x: number; // inches from left
  y: number; // inches from top
}

export interface ShapeSize {
  width: number;  // inches
  height: number; // inches
}

export interface ShapeStyle {
  fillColor?: string;   // hex color, e.g. "#FF0000"
  lineColor?: string;   // hex color
  lineWeight?: number;  // pts
  fontColor?: string;   // hex color
  fontSize?: number;    // pts
  fontBold?: boolean;
  fontItalic?: boolean;
}

export interface ShapeInfo {
  id: string;           // Visio shape ID, e.g. "Sheet.5"
  name: string;         // Shape name
  type: string;         // Shape master/type name
  text: string;         // Shape text content
  x: number;            // Position X (inches)
  y: number;            // Position Y (inches)
  width: number;        // Width (inches)
  height: number;       // Height (inches)
  pageId: number;       // Which page this shape is on
  pageName: string;     // Page name
}

export interface ConnectionInfo {
  id: string;           // Connector shape ID
  fromShapeId: string;  // Source shape ID
  toShapeId: string;    // Target shape ID
  text: string;         // Connector label text
}

export interface AddShapeInput {
  type: ShapeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  style?: ShapeStyle;
  pageIndex?: number;   // 0-based, defaults to active page
}

export interface AddShapeResult {
  shapeId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Default sizes per shape type (inches)
export const DEFAULT_SHAPE_SIZES: Record<ShapeType, ShapeSize> = {
  'rectangle': { width: 2.0, height: 1.0 },
  'rounded-rectangle': { width: 2.0, height: 1.0 },
  'ellipse': { width: 2.0, height: 1.0 },
  'diamond': { width: 2.0, height: 1.5 },
  'triangle': { width: 1.5, height: 1.5 },
  'line': { width: 2.0, height: 0 },
  'text': { width: 2.0, height: 0.5 },
  'server': { width: 1.5, height: 1.0 },
  'database': { width: 1.5, height: 1.0 },
  'router': { width: 1.5, height: 1.0 },
  'switch': { width: 1.5, height: 1.0 },
  'firewall': { width: 1.5, height: 1.0 },
  'computer': { width: 1.5, height: 1.0 },
  'cloud': { width: 2.0, height: 1.5 },
  'process': { width: 2.0, height: 1.0 },
  'decision': { width: 2.0, height: 1.5 },
  'document': { width: 2.0, height: 1.0 },
  'start-end': { width: 2.0, height: 1.0 },
};
