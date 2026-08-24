/**
 * Document and Page model definitions for VisioMCP
 * Clean data structures — no COM objects exposed.
 */

export interface DocumentInfo {
  name: string;           // e.g. "network.vsdx"
  fullPath: string;       // Full filesystem path
  saved: boolean;         // Whether unsaved changes exist
  pageCount: number;      // Number of pages
  activePageIndex: number; // 0-based active page index
  activePageName: string;  // Active page name
  creator: string;         // Document creator property
  description: string;     // Document description property
}

export interface PageInfo {
  index: number;    // 0-based page index
  name: string;     // Page name
  isBackground: boolean;
  width: number;    // Page width in inches
  height: number;   // Page height in inches
  shapeCount: number;
}

export interface VisioStatus {
  running: boolean;
  version?: string;
  activeDocument?: string;
  documentCount?: number;
  visioPath?: string;
}

export type ExportFormat = 'png' | 'pdf' | 'svg' | 'emf' | 'vsdx';

export interface ExportOptions {
  format: ExportFormat;
  outputPath: string;
  pageIndex?: number;   // Which page to export; omit for all pages
  resolution?: number;  // DPI for raster formats (default 96)
}
