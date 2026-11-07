import path from 'node:path';
import { createApp } from './app';
import { JsonStore } from './store';
import { demoCollection } from './seed';
import { emptyCollection } from '../shared/model';

const port = Number(process.env.PORT ?? 3001);
const store = new JsonStore(
  path.resolve(process.env.DATA_DIR ?? 'data', 'collection.json'),
  process.env.EMPTY_COLLECTION === '1'
    ? async () => emptyCollection()
    : demoCollection,
);
await store.initialize();
const server = createApp(store, process.env.NODE_ENV !== 'development').listen(
  port,
  '127.0.0.1',
  () => console.log(`My Wine Cellar: http://127.0.0.1:${port}`),
);
server.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
