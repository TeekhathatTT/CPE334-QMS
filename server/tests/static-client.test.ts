import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApp } from '../src/app';
import { DEFAULT_CLIENT_DIST } from '../src/staticClient';

/**
 * Lab 5 Issue #17, item 1: single-origin static serving of the built client.
 * Uses a temporary "built client" folder so the test never depends on a real `client/dist`.
 */
const INDEX_MARKER = '<div id="root" data-fixture="qms-static-test"></div>';
const ASSET_BODY = 'console.log("qms fixture asset");';

let fixtureDir: string;

beforeAll(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qms-client-dist-'));
  fs.writeFileSync(
    path.join(fixtureDir, 'index.html'),
    `<!doctype html><html><head><title>QMS</title></head><body>${INDEX_MARKER}</body></html>`
  );
  fs.mkdirSync(path.join(fixtureDir, 'assets'));
  fs.writeFileSync(path.join(fixtureDir, 'assets', 'app-abc123.js'), ASSET_BODY);
});

afterAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

const expectNotFoundEnvelope = (res: request.Response) => {
  expect(res.status).toBe(404);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  expect(typeof res.body.error.requestId).toBe('string');
};

describe('Production: built client served from the same origin', () => {
  const prodApp = () => createApp({ nodeEnv: 'production', clientDist: fixtureDir });

  it('GET / returns index.html', async () => {
    const res = await request(prodApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain(INDEX_MARKER);
  });

  it('GET on a client-side deep link (/customer) returns index.html', async () => {
    const res = await request(prodApp()).get('/customer');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain(INDEX_MARKER);
  });

  it('GET on a nested deep link returns index.html', async () => {
    const res = await request(prodApp()).get('/operator/queues/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(res.status).toBe(200);
    expect(res.text).toContain(INDEX_MARKER);
  });

  it('serves built static assets', async () => {
    const res = await request(prodApp()).get('/assets/app-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toBe(ASSET_BODY);
  });

  it('unknown /api paths still return the JSON 404 envelope, not index.html', async () => {
    const app = prodApp();
    for (const p of ['/api/unknown', '/api', '/api/queues/does/not/exist']) {
      const res = await request(app).get(p);
      expectNotFoundEnvelope(res);
      expect(res.text).not.toContain(INDEX_MARKER);
    }
  });

  it('non-GET requests outside /api are not answered with index.html', async () => {
    const res = await request(prodApp()).post('/customer').send({});
    expectNotFoundEnvelope(res);
  });

  it('fails clearly at startup when the client build is missing', () => {
    const missing = path.join(fixtureDir, 'does-not-exist');
    expect(() => createApp({ nodeEnv: 'production', clientDist: missing })).toThrow(/Client build not found/);
  });
});

describe('Non-production: no static serving', () => {
  for (const nodeEnv of ['development', 'test']) {
    it(`${nodeEnv}: / and deep links return the JSON 404 envelope`, async () => {
      const app = createApp({ nodeEnv, clientDist: fixtureDir });
      for (const p of ['/', '/customer', '/assets/app-abc123.js']) {
        const res = await request(app).get(p);
        expectNotFoundEnvelope(res);
      }
    });
  }
});

describe('Default client build location', () => {
  it('resolves to <repo>/client/dist relative to the server source, not the working directory', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    expect(DEFAULT_CLIENT_DIST).toBe(path.join(repoRoot, 'client', 'dist'));
  });
});
