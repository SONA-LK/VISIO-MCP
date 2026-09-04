/**
 * Unit tests for discovery-first stencil resolution.
 *
 * These run without a real Visio COM connection: `app` is either omitted
 * (filesystem-only resolution) or a plain object shaped like the small
 * slice of the Visio COM surface stencils.ts actually touches.
 */

import * as fsActual from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolve, CONTENT_DIR, resetMasterIndexCache } from '../../../diagram/stencils';
import { get } from '../../../diagram/types/registry';
import '../../../diagram/types/index';

// Mock only readdirSync (used by stencils.ts's content-folder scan) while
// keeping every other fs export real -- writeFileSync/unlinkSync below need
// to hit the real filesystem for the "candidate file exists on disk" cases.
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readdirSync: jest.fn(jest.requireActual('fs').readdirSync),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs: typeof fsActual = require('fs');
const readdirSyncMock = fs.readdirSync as unknown as jest.Mock;

const ACTIVITY = get('activity');
const FLOWCHART = get('flowchart');

// A KindSpec-based type whose whole vocabulary is force_primitive (like the
// reference project's jiat_activity type) needs no stencil at all.
const NO_STENCIL_SPEC = {
  ...ACTIVITY,
  key: 'no_stencil_test',
  vocabulary: Object.fromEntries(
    Object.entries(ACTIVITY.vocabulary).map(([k, v]) => [k, { ...v, force_primitive: true }]),
  ),
};

beforeEach(() => {
  resetMasterIndexCache();
  readdirSyncMock.mockImplementation(jest.requireActual('fs').readdirSync);
});

describe('resolve - no masters required', () => {
  it('resolves immediately with no COM app needed', () => {
    const res = resolve(NO_STENCIL_SPEC);
    expect(res.status).toBe('resolved');
    expect(res.stencil_path).toBeUndefined();
  });
});

describe('resolve - no app, no candidates on disk', () => {
  it('reports needs_download listing every required master', () => {
    // Use a filename guaranteed not to exist anywhere, rather than
    // FLOWCHART's real BASFLO_U.vssx candidate -- this test must behave
    // the same whether or not the machine running it happens to have
    // Visio installed.
    const spec = { ...FLOWCHART, stencils: ['DOES_NOT_EXIST_ANYWHERE_U.vssx'] };
    const res = resolve(spec);
    expect(res.status).toBe('needs_download');
    expect(res.missing_masters).toEqual(
      expect.arrayContaining(['Start/End', 'Process', 'Decision', 'Data', 'Document']),
    );
    expect(res.message).toContain(FLOWCHART.friendly);
  });
});

describe('resolve - no app, absolute candidate path exists on disk', () => {
  it('trusts the candidate file without master verification', () => {
    const tmpFile = path.join(os.tmpdir(), `visiomcp-test-stencil-${Date.now()}.vssx`);
    fs.writeFileSync(tmpFile, '');
    try {
      const spec = { ...FLOWCHART, stencils: [tmpFile] };
      const res = resolve(spec);
      expect(res.status).toBe('resolved');
      expect(res.stencil_path).toBe(tmpFile);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// -- mocked COM app -----------------------------------------------------
function mockMaster(name: string) {
  return { Name: name };
}

function mockDoc(masterNames: string[], fullName = '') {
  return {
    FullName: fullName,
    Masters: {
      Count: masterNames.length,
      Item: (i: number) => mockMaster(masterNames[i - 1]),
    },
  };
}

describe('resolve - running document already has the masters', () => {
  it('resolves from the open document, no candidate file needed', () => {
    const doc = mockDoc(['Start/End', 'Process', 'Decision', 'Data', 'Document'], 'C:\\open\\stencil.vssx');
    const app = {
      Documents: {
        Count: 1,
        Item: () => doc,
      },
    };
    const res = resolve(FLOWCHART, app);
    expect(res.status).toBe('resolved');
    expect(res.stencil_path).toBe('C:\\open\\stencil.vssx');
    expect(res.message).toContain('already-open');
  });
});

describe('resolve - candidate file verified via OpenEx', () => {
  it('resolves the candidate once its masters are confirmed', () => {
    const tmpFile = path.join(os.tmpdir(), `visiomcp-test-candidate-${Date.now()}.vssx`);
    fs.writeFileSync(tmpFile, '');
    try {
      const spec = { ...FLOWCHART, stencils: [tmpFile] };
      const app = {
        Documents: {
          Count: 0,
          Item: () => {
            throw new Error('no open docs');
          },
          OpenEx: (p: string) => mockDoc(['Start/End', 'Process', 'Decision', 'Data', 'Document']),
        },
      };
      const res = resolve(spec, app);
      expect(res.status).toBe('resolved');
      expect(res.stencil_path).toBe(tmpFile);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe('resolve - master index scan (content-folder fallback)', () => {
  it('resolves via a single stencil found by scanning the content folder', () => {
    const indexed = path.join(CONTENT_DIR, 'BASFLO_U.vssx');
    readdirSyncMock.mockImplementation((dir: fsActual.PathLike) => {
      if (String(dir) === CONTENT_DIR) return ['BASFLO_U.vssx', 'OTHER_U.vssx'];
      throw new Error(`unexpected readdirSync(${String(dir)})`);
    });

    const app = {
      Documents: {
        Count: 0,
        Item: () => {
          throw new Error('no open docs');
        },
        OpenEx: (p: string) => {
          if (p === indexed) {
            return mockDoc(['Start/End', 'Process', 'Decision', 'Data', 'Document']);
          }
          return mockDoc([]);
        },
      },
    };

    const res = resolve({ ...FLOWCHART, stencils: [] }, app);
    expect(res.status).toBe('resolved');
    expect(res.stencil_path).toBe(indexed);
    expect(res.message).toContain('master index');
  });

  it('reports partial when masters are split across more than one stencil', () => {
    readdirSyncMock.mockImplementation((dir: fsActual.PathLike) => {
      if (String(dir) === CONTENT_DIR) return ['A_U.vssx', 'B_U.vssx'];
      throw new Error(`unexpected readdirSync(${String(dir)})`);
    });

    const app = {
      Documents: {
        Count: 0,
        Item: () => {
          throw new Error('no open docs');
        },
        OpenEx: (p: string) => {
          if (p.endsWith('A_U.vssx')) return mockDoc(['Start/End', 'Process']);
          if (p.endsWith('B_U.vssx')) return mockDoc(['Decision', 'Data']);
          return mockDoc([]);
        },
      },
    };

    const res = resolve({ ...FLOWCHART, stencils: [] }, app);
    expect(res.status).toBe('partial');
    expect(res.missing_masters).toEqual(['Document']);
  });
});
