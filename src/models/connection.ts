/**
 * Connection/Connector model definitions for VisioMCP
 */

export interface ConnectShapesInput {
  fromShapeId: string;   // Source shape ID
  toShapeId: string;     // Target shape ID
  text?: string;         // Optional connector label
  pageIndex?: number;    // 0-based, defaults to active page
}

export interface ConnectShapesResult {
  connectorId: string;   // The new connector's shape ID
  fromShapeId: string;
  toShapeId: string;
}

export interface ConnectionDetail {
  connectorId: string;
  fromShapeId: string;
  fromShapeName: string;
  toShapeId: string;
  toShapeName: string;
  text: string;
}
