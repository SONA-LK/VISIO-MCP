/**
 * Zod schemas for all VisioMCP tool inputs.
 * Every tool input is validated here before touching COM.
 */

import { z } from 'zod';

export const ShapeTypeSchema = z.enum([
  'rectangle','rounded-rectangle','ellipse','diamond','triangle',
  'line','text','server','database','router','switch','firewall',
  'computer','cloud','process','decision','document','start-end',
]);

export const StyleSchema = z.object({
  fillColor:  z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color e.g. "#FF0000"').optional(),
  lineColor:  z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  lineWeight: z.number().positive().optional(),
  fontColor:  z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontSize:   z.number().positive().optional(),
  fontBold:   z.boolean().optional(),
  fontItalic: z.boolean().optional(),
});

export const GetVisioStatusSchema  = z.object({});
export const OpenVisioSchema       = z.object({ visioPath: z.string().optional() });
export const CreateDocumentSchema  = z.object({});
export const OpenDocumentSchema    = z.object({ filePath: z.string().min(1) });
export const SaveDocumentSchema    = z.object({
  filePath:  z.string().optional(),
  overwrite: z.boolean().optional().default(false),
});
export const CloseDocumentSchema   = z.object({ save: z.boolean().optional().default(false) });
export const GetDocumentInfoSchema = z.object({});
export const GetPagesSchema        = z.object({});
export const CreatePageSchema      = z.object({ name: z.string().optional() });

export const AddShapeSchema = z.object({
  type:      ShapeTypeSchema,
  x:         z.number(),
  y:         z.number(),
  width:     z.number().positive().optional(),
  height:    z.number().positive().optional(),
  text:      z.string().optional(),
  style:     StyleSchema.optional(),
  pageIndex: z.number().int().min(0).optional(),
});

export const SetShapeTextSchema = z.object({
  shapeId:   z.string().min(1),
  text:      z.string(),
  pageIndex: z.number().int().min(0).optional(),
});

export const MoveShapeSchema = z.object({
  shapeId:   z.string().min(1),
  x:         z.number(),
  y:         z.number(),
  pageIndex: z.number().int().min(0).optional(),
});

export const ResizeShapeSchema = z.object({
  shapeId:   z.string().min(1),
  width:     z.number().positive(),
  height:    z.number().positive(),
  pageIndex: z.number().int().min(0).optional(),
});

export const DeleteShapeSchema = z.object({
  shapeId:   z.string().min(1),
  pageIndex: z.number().int().min(0).optional(),
});

export const ConnectShapesSchema = z.object({
  fromShapeId: z.string().min(1),
  toShapeId:   z.string().min(1),
  text:        z.string().optional(),
  pageIndex:   z.number().int().min(0).optional(),
});

export const GetShapesSchema = z.object({
  pageIndex: z.number().int().min(0).optional(),
});

export const GetSelectionSchema = z.object({});

export const GetConnectionsSchema = z.object({
  pageIndex: z.number().int().min(0).optional(),
});

export const ExportDocumentSchema = z.object({
  outputPath: z.string().min(1),
  format:     z.enum(['png', 'pdf', 'svg', 'emf', 'vsdx']),
  pageIndex:  z.number().int().min(0).optional(),
});

// Type exports
export type ShapeType           = z.infer<typeof ShapeTypeSchema>;
export type AddShapeInput_      = z.infer<typeof AddShapeSchema>;
export type ConnectShapesInput_ = z.infer<typeof ConnectShapesSchema>;
export type SaveDocumentInput   = z.infer<typeof SaveDocumentSchema>;
export type ExportDocumentInput = z.infer<typeof ExportDocumentSchema>;
