/**
 * VisioDocument — Document management abstraction layer.
 *
 * Correct Visio COM constants used here:
 *   ExportAsFixedFormat(format, path, intent, printRange, fromPage, toPage, colorMode, majorGridlines...)
 *     format: 1 = visFixedFormatPDF, 2 = visFixedFormatXPS
 *     intent: 1 = visDocExIntentPrint, 2 = visDocExIntentScreen
 *
 *   CellsSRC(section, row, column):
 *     Page size: section=1 (visSectionObject), row=0 (visRowPage), col=0=PageWidth col=1=PageHeight
 *     Correct: visSectionObject=1, visRowPage=0, visPageWidth=0, visPageHeight=1
 */

import * as path from 'path';
import { visioApp } from './application';
import { logger } from '../utils/logger';
import {
  documentNotOpen,
  documentNotFound,
  fileAlreadyExists,
  wrapError,
} from '../utils/errors';
import { DocumentInfo, PageInfo, ExportOptions } from '../models/document';
import { validateVisioFilePath, validateExportPath, pathExists } from '../utils/paths';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type COMObject = any;

// Visio ExportAsFixedFormat constants
const visFixedFormatPDF  = 1;
const visDocExIntentPrint = 1;

// Visio CellsSRC constants for page dimensions
const visSectionObject = 1;
const visRowPage       = 0;
const visPageWidth     = 0;  // col 0
const visPageHeight    = 1;  // col 1

export class VisioDocument {

  /** Return the first open document. Throws if none open. */
  private getActiveDoc(): COMObject {
    const app   = visioApp.getRawApp();
    const count = Number(app.Documents.Count);
    if (count === 0) throw documentNotOpen();
    return app.Documents.Item(1);
  }

  /** Create a new blank document. */
  async create(): Promise<DocumentInfo> {
    await visioApp.ensureConnected();
    try {
      const app = visioApp.getRawApp();
      // Empty string = blank template
      const doc = app.Documents.Add('');
      logger.info('Created new document', { name: doc.Name });
      return this.buildDocumentInfo(doc);
    } catch (err) {
      throw wrapError(err, 'create_document');
    }
  }

  /** Open an existing .vsdx or .vsd file. */
  async open(filePath: string): Promise<DocumentInfo> {
    await visioApp.ensureConnected();
    const normalized = validateVisioFilePath(filePath);
    if (!pathExists(normalized)) throw documentNotFound(normalized);

    try {
      const app = visioApp.getRawApp();
      const doc = app.Documents.Open(normalized);
      logger.info('Opened document', { path: normalized });
      return this.buildDocumentInfo(doc);
    } catch (err) {
      throw wrapError(err, 'open_document');
    }
  }

  /** Save the active document in place. */
  async save(): Promise<void> {
    await visioApp.ensureConnected();
    try {
      const doc = this.getActiveDoc();
      doc.Save();
      logger.info('Saved document', { name: doc.Name });
    } catch (err) {
      throw wrapError(err, 'save_document');
    }
  }

  /** Save the active document to a new path. */
  async saveAs(filePath: string, overwrite = false): Promise<void> {
    await visioApp.ensureConnected();
    const normalized = validateVisioFilePath(filePath);
    if (!overwrite && pathExists(normalized)) throw fileAlreadyExists(normalized);

    try {
      const doc = this.getActiveDoc();
      doc.SaveAs(normalized);
      logger.info('SaveAs document', { path: normalized });
    } catch (err) {
      throw wrapError(err, 'save_document');
    }
  }

  /** Close the active document. Optionally save first. */
  async close(save = false): Promise<void> {
    await visioApp.ensureConnected();
    try {
      const doc  = this.getActiveDoc();
      const name = String(doc.Name);
      if (save) doc.Save();
      doc.Close();
      logger.info('Closed document', { name });
    } catch (err) {
      throw wrapError(err, 'close_document');
    }
  }

  /** Get info about the active document. */
  async getInfo(): Promise<DocumentInfo> {
    await visioApp.ensureConnected();
    try {
      return this.buildDocumentInfo(this.getActiveDoc());
    } catch (err) {
      throw wrapError(err, 'get_document_info');
    }
  }

  /** List all pages in the active document. */
  async getPages(): Promise<PageInfo[]> {
    await visioApp.ensureConnected();
    try {
      const doc   = this.getActiveDoc();
      const pages = doc.Pages;
      const count = Number(pages.Count);
      const result: PageInfo[] = [];
      for (let i = 1; i <= count; i++) {
        result.push(this.buildPageInfo(pages.Item(i), i - 1));
      }
      return result;
    } catch (err) {
      throw wrapError(err, 'get_pages');
    }
  }

  /** Add a new page to the active document. */
  async createPage(name?: string): Promise<PageInfo> {
    await visioApp.ensureConnected();
    try {
      const doc   = this.getActiveDoc();
      const page  = doc.Pages.Add();
      if (name) page.Name = name;
      const index = Number(doc.Pages.Count) - 1;
      logger.info('Created page', { name: page.Name, index });
      return this.buildPageInfo(page, index);
    } catch (err) {
      throw wrapError(err, 'create_page');
    }
  }

  /** Export document/page to a file. */
  async export(options: ExportOptions): Promise<void> {
    await visioApp.ensureConnected();
    const outputPath = validateExportPath(options.outputPath);
    const ext        = path.extname(outputPath).toLowerCase();

    try {
      const doc = this.getActiveDoc();

      if (ext === '.pdf') {
        // ExportAsFixedFormat(format, outputFile, intent, printRange)
        // printRange 0 = visAllPages
        doc.ExportAsFixedFormat(visFixedFormatPDF, outputPath, visDocExIntentPrint, 0);
        logger.info('Exported as PDF', { path: outputPath });

      } else if (ext === '.png' || ext === '.svg' || ext === '.emf') {
        // Page.Export(path) — exports the page as the specified image type
        // Visio infers format from the file extension
        const pageIdx = options.pageIndex !== undefined ? options.pageIndex + 1 : 1;
        const page    = doc.Pages.Item(pageIdx);
        page.Export(outputPath);
        logger.info('Exported page as image', { path: outputPath, ext });

      } else if (ext === '.vsdx') {
        doc.SaveAs(outputPath);
        logger.info('Saved as VSDX', { path: outputPath });

      } else {
        throw new Error(`Unsupported export format: ${ext}`);
      }
    } catch (err) {
      throw wrapError(err, 'export_document');
    }
  }

  /**
   * Get a raw COM Page object by 0-based index.
   * INTERNAL USE ONLY — never pass to MCP layer.
   */
  async getRawPage(pageIndex?: number): Promise<COMObject> {
    await visioApp.ensureConnected();
    const doc   = this.getActiveDoc();
    const pages = doc.Pages;
    const count = Number(pages.Count);

    if (count === 0) throw new Error('Document has no pages');

    // Convert 0-based external index to 1-based Visio index
    const oneBasedIdx = pageIndex !== undefined ? pageIndex + 1 : 1;
    if (oneBasedIdx < 1 || oneBasedIdx > count) {
      throw new Error(
        `Page index ${pageIndex} out of range — document has ${count} page(s) (0-based: 0–${count - 1})`,
      );
    }

    return pages.Item(oneBasedIdx);
  }

  /**
   * Get a raw COM Document object.
   * INTERNAL USE ONLY.
   */
  async getRawDoc(): Promise<COMObject> {
    await visioApp.ensureConnected();
    return this.getActiveDoc();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildDocumentInfo(doc: COMObject): DocumentInfo {
    try {
      const pages     = doc.Pages;
      const pageCount = Number(pages.Count);

      let activePageIndex = 0;
      let activePageName  = '';

      if (pageCount > 0) {
        try {
          const activePage = visioApp.getRawApp().ActivePage;
          if (activePage) {
            activePageName = String(activePage.Name);
            for (let i = 1; i <= pageCount; i++) {
              if (String(pages.Item(i).Name) === activePageName) {
                activePageIndex = i - 1;
                break;
              }
            }
          }
        } catch {
          activePageName  = String(pages.Item(1).Name);
          activePageIndex = 0;
        }
      }

      let fullPath = '';
      try { fullPath = String(doc.FullName); } catch { fullPath = String(doc.Name); }

      return {
        name:            String(doc.Name),
        fullPath,
        saved:           Boolean(doc.Saved),
        pageCount,
        activePageIndex,
        activePageName,
        creator:         this.safeProp(doc, 'Creator', ''),
        description:     this.safeProp(doc, 'Description', ''),
      };
    } catch (err) {
      throw wrapError(err, 'buildDocumentInfo');
    }
  }

  private buildPageInfo(page: COMObject, zeroBasedIndex: number): PageInfo {
    let width  = 11;   // letter landscape default
    let height = 8.5;

    try {
      // CellsSRC(section, row, column)
      // visSectionObject=1, visRowPage=0, visPageWidth=0, visPageHeight=1
      width  = Number(page.PageSheet.CellsSRC(visSectionObject, visRowPage, visPageWidth).Result('in'));
      height = Number(page.PageSheet.CellsSRC(visSectionObject, visRowPage, visPageHeight).Result('in'));
    } catch {
      // use defaults — page may not expose PageSheet cleanly on older Visio
    }

    let shapeCount = 0;
    try { shapeCount = Number(page.Shapes.Count); } catch { /* default 0 */ }

    return {
      index:        zeroBasedIndex,
      name:         String(page.Name),
      isBackground: Boolean(page.Background),
      width,
      height,
      shapeCount,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private safeProp(obj: COMObject, prop: string, fallback: any): any {
    try { return obj[prop]; } catch { return fallback; }
  }
}

// Singleton
export const visioDocument = new VisioDocument();
