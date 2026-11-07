import express from 'express';
import path from 'node:path';
import { ZodError } from 'zod';
import {
  commandSchema,
  DomainError,
  fieldsFromError,
} from '../shared/commands';
import { summary, searchBottle, occupancy } from '../shared/model';
import { pairingsFor, reversePairing } from '../shared/pairings';
import { exportCsv } from '../shared/csv';
import type { JsonStore } from './store';

export function createApp(store: JsonStore, production = false) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
    );
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    const origin = req.get('origin');
    if (
      !['GET', 'HEAD'].includes(req.method) &&
      origin &&
      !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    )
      return res.status(403).json({ message: 'Local requests only' });
    next();
  });
  app.use(express.json({ limit: '100mb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/collection', async (_req, res) => res.json(await store.get()));
  app.get('/api/bottles', async (req, res) => {
    const s = await store.get();
    res.json(
      s.bottles.filter((b) => searchBottle(b, String(req.query.q ?? ''))),
    );
  });
  app.get('/api/bottles/:id', async (req, res) => {
    const s = await store.get();
    const b = s.bottles.find((b) => b.id === req.params.id);
    if (!b) throw new DomainError('Bottle not found', {}, 404);
    res.json({ ...b, pairingsSuggested: pairingsFor(b) });
  });
  app.get('/api/cellars', async (_req, res) => {
    const s = await store.get();
    res.json(s.cellars.map((c) => ({ ...c, occupancy: occupancy(s, c.id) })));
  });
  app.get('/api/statistics', async (_req, res) =>
    res.json(summary(await store.get())),
  );
  app.get('/api/pairings', async (req, res) =>
    res.json(
      reversePairing((await store.get()).bottles, String(req.query.dish ?? '')),
    ),
  );
  app.get('/api/backup', async (_req, res) =>
    res
      .attachment(
        `my-wine-cellar-${new Date().toISOString().slice(0, 10)}.json`,
      )
      .json(await store.get()),
  );
  app.get('/api/export.csv', async (_req, res) => {
    const s = await store.get();
    res
      .type('text/csv')
      .attachment('my-wine-cellar.csv')
      .send(exportCsv(s.bottles, s));
  });
  app.post('/api/commands', async (req, res) =>
    res.json(await store.execute(commandSchema.parse(req.body))),
  );
  app.use('/api', (_req, res) =>
    res.status(404).json({ message: 'API endpoint not found' }),
  );
  if (production) {
    app.use(express.static(path.resolve('dist')));
    app.get('/{*splat}', (_req, res) =>
      res.sendFile(path.resolve('dist', 'index.html')),
    );
  }
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof ZodError)
        return res.status(400).json({
          message: 'Please correct the highlighted fields',
          fields: fieldsFromError(error),
        });
      if (error instanceof DomainError)
        return res
          .status(error.status)
          .json({ message: error.message, fields: error.fields });
      if (error instanceof SyntaxError)
        return res.status(400).json({ message: 'Invalid JSON request' });
      console.error('API operation failed:', error);
      res.status(500).json({
        message:
          'Unable to save or read the JSON repository. Your existing data is unchanged. Retry when storage is available.',
      });
    },
  );
  return app;
}
