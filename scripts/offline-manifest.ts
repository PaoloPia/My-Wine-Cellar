import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = await Promise.all(
    entries.map((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name))
        : [path.join(dir, e.name)],
    ),
  );
  return results.flat();
}
const assets = (await files('dist'))
  .filter((p) => !p.endsWith('sw.js') && !p.endsWith('offline-assets.json'))
  .map((p) => '/' + path.relative('dist', p).split(path.sep).join('/'));
await writeFile(
  path.join('dist', 'offline-assets.json'),
  JSON.stringify({ version: Date.now().toString(), assets: ['/', ...assets] }),
);
