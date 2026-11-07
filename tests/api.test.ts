import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import request from 'supertest';
import { createApp } from '../server/app';
import { JsonStore } from '../server/store';
import { command, fixture } from './helpers';

let directory: string;
let store: JsonStore;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'wine-test-'));
  store = new JsonStore(path.join(directory, 'collection.json'), async () =>
    fixture(),
  );
  await store.initialize();
  app = createApp(store);
});
afterEach(async () => {
  await rm(directory, { recursive: true });
});
describe('JSON-backed REST API', () => {
  it('TC-001: anonymous read and durable data survive store restart', async () => {
    const state = await store.get();
    await request(app)
      .post('/api/commands')
      .send(command(state, { type: 'quantity', id: 'b1', delta: 1 }))
      .expect(200);
    const reopened = new JsonStore(
      path.join(directory, 'collection.json'),
      async () => {
        throw new Error('Must not reseed');
      },
    );
    await reopened.initialize();
    expect((await reopened.get()).bottles[0].quantity).toBe(7);
    await request(app).get('/api/health').expect(200);
  });
  it('TC-002/035/036: REST reports, backup and export contain collection data', async () => {
    const stats = await request(app).get('/api/statistics').expect(200);
    expect(stats.body.total).toBe(9);
    const backup = await request(app).get('/api/backup').expect(200);
    expect(backup.body.bottles[0].photos).toHaveLength(1);
    const csv = await request(app).get('/api/export.csv').expect(200);
    expect(csv.text).toContain('Franciacorta');
    const pairings = await request(app).get('/api/bottles/b1').expect(200);
    expect(pairings.body.pairingsSuggested.length).toBeGreaterThanOrEqual(3);
    await request(app).get('/api/bottles/missing').expect(404);
    const search = await request(app).get('/api/bottles?q=barolo').expect(200);
    expect(search.body).toHaveLength(1);
  });
  it('TC-003: invalid backup or malformed JSON cannot alter storage', async () => {
    const before = await readFile(
      path.join(directory, 'collection.json'),
      'utf8',
    );
    await request(app)
      .post('/api/commands')
      .send({
        ...command(await store.get(), {
          type: 'clear',
          confirmation: 'DELETE ALL DATA',
        }),
        action: { type: 'restore', collection: { version: 99 } },
      })
      .expect(400);
    await request(app)
      .post('/api/commands')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);
    expect(
      await readFile(path.join(directory, 'collection.json'), 'utf8'),
    ).toBe(before);
  });
  it('TC-052: simultaneous mutations serialize and conflicting writes are rejected', async () => {
    const s = await store.get();
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post('/api/commands')
          .send(command(s, { type: 'quantity', id: 'b1', delta: 1 })),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await store.get()).bottles[0].quantity).toBe(7);
  });
  it('TC-052: lost-response replay is idempotent even after store restart', async () => {
    const cmd = command(await store.get(), {
      type: 'open',
      id: 'b1',
      quantity: 2,
      date: '2026-11-06',
      occasion: '',
      people: '',
      notes: '',
    });
    await request(app).post('/api/commands').send(cmd).expect(200);
    const reopened = new JsonStore(
      path.join(directory, 'collection.json'),
      async () => fixture(),
    );
    await reopened.initialize();
    await request(createApp(reopened))
      .post('/api/commands')
      .send(cmd)
      .expect(200);
    expect((await reopened.get()).bottles[0].quantity).toBe(4);
    expect(
      (await reopened.get()).bottles[0].history.filter(
        (e) => e.kind === 'opened',
      ),
    ).toHaveLength(1);
  });
  it('TC-039: deletion persists across restart and does not silently seed again', async () => {
    await request(app)
      .post('/api/commands')
      .send(
        command(await store.get(), {
          type: 'clear',
          confirmation: 'DELETE ALL DATA',
        }),
      )
      .expect(200);
    await store.initialize();
    expect((await store.get()).cellars).toEqual([]);
    expect((await store.get()).bottles).toEqual([]);
  });
  it('TC-051: rejects cross-site writes and sets no tracking cookies', async () => {
    const res = await request(app).get('/api/collection');
    expect(res.headers['set-cookie']).toBeUndefined();
    await request(app)
      .post('/api/commands')
      .set('Origin', 'https://example.com')
      .send(
        command(await store.get(), {
          type: 'clear',
          confirmation: 'DELETE ALL DATA',
        }),
      )
      .expect(403);
  });
  it('TC-052: storage write failure reports an error, keeps old data, and accepts retry exactly once', async () => {
    const before = await store.get();
    const cmd = command(before, { type: 'quantity', id: 'b1', delta: 1 });
    const blockedPath = path.join(directory, 'collection.json.tmp');
    await mkdir(blockedPath);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await request(app).post('/api/commands').send(cmd).expect(500);
    expect(await store.get()).toEqual(before);
    await rm(blockedPath, { recursive: true });
    await request(app).post('/api/commands').send(cmd).expect(200);
    expect((await store.get()).bottles[0].quantity).toBe(7);
    log.mockRestore();
  });
  it('TC-052: corrupt on-disk repositories are not replaced by demo data', async () => {
    await writeFile(path.join(directory, 'collection.json'), '{corrupt');
    await expect(store.initialize()).rejects.toThrow();
  });
});
