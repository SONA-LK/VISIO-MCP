/**
 * VisioApplication — Manages the COM connection to Microsoft Visio.
 *
 * winax provides Windows COM automation for Node.js.
 * Key facts about winax:
 *   - `new winax.Object('Visio.Application')` = COM CreateObject (starts new instance)
 *   - `winax.GetObject('', 'Visio.Application')` = GetActiveObject equivalent
 *   - There is NO direct winax.GetActiveObject() — must use winax.GetObject with empty moniker
 *
 * Strategy:
 *   1. winax.GetObject('', 'Visio.Application') — attach to running instance
 *   2. If that throws, launch via new winax.Object('Visio.Application')
 *   3. Verify the handle is still alive on every ensureConnected() call
 */

import * as childProcess from 'child_process';
import { logger } from '../utils/logger';
import {
  visioNotInstalled,
  visioNotRunning,
  visioCannotStart,
  wrapError,
} from '../utils/errors';
import { detectVisioPath } from './detector';
import { getConfig } from '../config/config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WinaxLib = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type COMObject = any;

let winax: WinaxLib | null = null;

function loadWinax(): WinaxLib {
  if (winax) return winax;
  try {
    // Dynamic require — winax is a native Windows addon.
    // TypeScript compilation succeeds on any OS; runtime fails gracefully on non-Windows.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    winax = require('winax');
    return winax;
  } catch {
    throw visioNotInstalled();
  }
}

/**
 * Try to attach to the running Visio COM instance.
 * Uses GetObject with an empty moniker, which is the winax equivalent
 * of the Win32 GetActiveObject('Visio.Application') API.
 * Returns null if no instance is running.
 */
function tryGetActiveVisio(wx: WinaxLib): COMObject | null {
  try {
    // winax.GetObject(moniker, progid) — empty moniker = GetActiveObject semantics
    const app = wx.GetObject('', 'Visio.Application');
    // Verify it's truly alive with a property read
    void app.Name;
    return app;
  } catch {
    return null;
  }
}

export class VisioApplication {
  private _app: COMObject | null = null;
  private _connected = false;

  /**
   * Connect to Visio.
   * Attaches to an existing instance if running, starts one otherwise.
   * Safe to call repeatedly — returns immediately if already connected.
   */
  async connect(): Promise<void> {
    // Fast path: already connected, verify still alive
    if (this._connected && this._app) {
      try {
        void this._app.Name;
        return;
      } catch {
        this._app = null;
        this._connected = false;
        logger.warn('Lost COM connection to Visio — reconnecting');
      }
    }

    const wx = loadWinax();

    // Attempt 1: attach to running Visio
    const existing = tryGetActiveVisio(wx);
    if (existing) {
      this._app = existing;
      this._connected = true;
      logger.info('Attached to existing Visio instance', {
        version: this.safeVersion(),
      });
      return;
    }

    logger.info('No running Visio instance found');

    const config = getConfig();
    if (!config.autoStartVisio) {
      throw visioNotRunning();
    }

    // Detect Visio path before attempting COM launch
    const visioPath = detectVisioPath(config.visioPath);
    if (!visioPath) {
      throw visioNotInstalled();
    }

    // Attempt 2: COM CreateObject — launches a new Visio instance
    try {
      logger.info('Launching Visio via COM CreateObject', { visioPath });
      const app = new wx.Object('Visio.Application');
      app.Visible = true;
      this._app = app;
      this._connected = true;
      logger.info('Visio started successfully', { version: this.safeVersion() });
      return;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.error('COM CreateObject failed — trying process spawn fallback', {
        error: detail,
      });
    }

    // Attempt 3: spawn VISIO.EXE and then attach via GetObject
    try {
      await this.spawnVisioAndAttach(wx, visioPath);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.error('All Visio launch strategies failed', { error: detail });
      throw visioCannotStart(detail);
    }
  }

  /**
   * Spawn VISIO.EXE via child_process, then poll for the COM object.
   * Used as fallback when COM CreateObject fails.
   */
  private async spawnVisioAndAttach(wx: WinaxLib, visioPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('Spawning VISIO.EXE directly', { visioPath });

      const proc = childProcess.spawn(visioPath, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      proc.unref();

      // Poll for COM availability — Visio needs a few seconds to start
      const maxAttempts = 20;
      const intervalMs = 1000;
      let attempts = 0;

      const poll = setInterval(() => {
        attempts++;
        logger.debug(`COM attach attempt ${attempts}/${maxAttempts}`);

        const app = tryGetActiveVisio(wx);
        if (app) {
          clearInterval(poll);
          this._app = app;
          this._connected = true;
          logger.info('Attached to spawned Visio', { version: this.safeVersion() });
          resolve();
          return;
        }

        if (attempts >= maxAttempts) {
          clearInterval(poll);
          reject(new Error(
            `Visio process started but COM server did not become available after ${maxAttempts}s`,
          ));
        }
      }, intervalMs);
    });
  }

  /** Ensure we have a live connection. Call at the start of every operation. */
  async ensureConnected(): Promise<void> {
    await this.connect();
  }

  /**
   * Check whether Visio is running without starting it.
   * Non-throwing — returns false on any error.
   */
  isRunning(): boolean {
    try {
      const wx = loadWinax();
      return tryGetActiveVisio(wx) !== null;
    } catch {
      return false;
    }
  }

  /** Get Visio version string. */
  getVersion(): string {
    this.requireConnected();
    try {
      return String(this._app!.Version);
    } catch (err) {
      throw wrapError(err, 'GetVersion');
    }
  }

  /** Get Visio application path (directory containing VISIO.EXE). */
  getApplicationPath(): string {
    this.requireConnected();
    try {
      return String(this._app!.Path);
    } catch {
      return 'Unknown';
    }
  }

  /** Number of open Visio documents. */
  getDocumentCount(): number {
    this.requireConnected();
    try {
      return Number(this._app!.Documents.Count);
    } catch (err) {
      throw wrapError(err, 'DocumentCount');
    }
  }

  /**
   * Get the raw COM Application object.
   * INTERNAL USE ONLY — never pass this to the MCP layer.
   */
  getRawApp(): COMObject {
    this.requireConnected();
    return this._app!;
  }

  /** Quit Visio. Does not save open documents. */
  quit(): void {
    if (!this._connected || !this._app) return;
    try {
      this._app.Quit();
    } catch {
      // Ignore — process may already be gone
    }
    this._app = null;
    this._connected = false;
    logger.info('Visio quit');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private safeVersion(): string {
    try {
      return this._app ? String(this._app.Version) : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private requireConnected(): void {
    if (!this._connected || !this._app) {
      throw visioNotRunning();
    }
  }
}

// Singleton — one VisioApplication per VisioMCP process
export const visioApp = new VisioApplication();
