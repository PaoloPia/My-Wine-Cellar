import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { collectionSchema, type Collection } from '../shared/model';
import { applyCommand, type Command } from '../shared/commands';

const diskSchema = z.object({
  collection: collectionSchema,
  receipts: z.array(z.object({ id: z.string(), payload: z.string() })),
});
export class JsonStore {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private filename: string,
    private seed: () => Promise<Collection>,
  ) {}
  async initialize() {
    await mkdir(path.dirname(this.filename), { recursive: true });
    try {
      await this.read();
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
      await this.write({ collection: await this.seed(), receipts: [] });
    }
  }
  private async read() {
    return diskSchema.parse(JSON.parse(await readFile(this.filename, 'utf8')));
  }
  private async write(data: z.infer<typeof diskSchema>) {
    const tmp = `${this.filename}.tmp`;
    const file = await open(tmp, 'w');
    try {
      await file.writeFile(JSON.stringify(data));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(tmp, this.filename);
  }
  async get() {
    await this.tail;
    return (await this.read()).collection;
  }
  execute(command: Command) {
    const task = this.tail.then(async () => {
      const data = await this.read();
      const payload = createHash('sha256')
        .update(JSON.stringify(command))
        .digest('hex');
      const receipt = data.receipts.find((r) => r.id === command.id);
      if (receipt) {
        if (receipt.payload !== payload)
          throw new Error('Request ID reused for a different operation');
        return data.collection;
      }
      const collection = applyCommand(data.collection, command);
      await this.write({
        collection,
        receipts: [...data.receipts, { id: command.id, payload }].slice(-10000),
      });
      return collection;
    });
    this.tail = task.catch(() => undefined);
    return task;
  }
}
