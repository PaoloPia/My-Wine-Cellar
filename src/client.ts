import { openDB } from 'idb';
import { collectionSchema, type Collection } from '../shared/model';
import {
  applyCommand,
  DomainError,
  type Action,
  type Command,
} from '../shared/commands';

type Cache = { state: Collection; queue: Command[] };
const db = () =>
  openDB('my-wine-cellar', 1, {
    upgrade(db) {
      db.createObjectStore('collection');
    },
  });
const readCache = async (): Promise<Cache | undefined> =>
  (await db()).get('collection', 'current');
const writeCache = async (cache: Cache) => {
  await (await db()).put('collection', cache, 'current');
};
async function request(url: string, command?: Command) {
  const res = await fetch(
    url,
    command
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(command),
        }
      : { cache: 'no-store' },
  );
  if (!res.ok) {
    const error = await res.json();
    throw new DomainError(
      error.message ?? 'Request failed',
      error.fields ?? {},
      res.status,
    );
  }
  return collectionSchema.parse(await res.json());
}
export class ClientRepository {
  state!: Collection;
  queue: Command[] = [];
  private tail: Promise<unknown> = Promise.resolve();
  async load() {
    const cache = await readCache();
    if (cache?.queue.length) {
      this.state = collectionSchema.parse(cache.state);
      this.queue = cache.queue;
      for (const command of this.queue) {
        if (command.expectedRevision === this.state.revision)
          this.state = applyCommand(this.state, command);
      }
      return this.state;
    }
    try {
      this.state = await request('/api/collection');
      await writeCache({ state: this.state, queue: [] });
    } catch (error) {
      if (!(error instanceof TypeError) || !cache) throw error;
      this.state = cache.state;
    }
    return this.state;
  }
  private serialize<T>(work: () => Promise<T>) {
    const task = this.tail.then(work);
    this.tail = task.catch(() => undefined);
    return task;
  }
  execute(action: Action, expectedRevision = this.state.revision) {
    return this.serialize(async () => {
      const command: Command = {
        id: crypto.randomUUID(),
        expectedRevision,
        date: new Date().toISOString(),
        action,
      };
      const next = applyCommand(this.state, command);
      // Persist the exact request before transmission, so a lost response is safely retried.
      await writeCache({ state: this.state, queue: [...this.queue, command] });
      if (this.queue.length || !navigator.onLine) {
        this.queue.push(command);
        this.state = next;
        return this.state;
      }
      let remote: Collection;
      try {
        remote = await request('/api/commands', command);
      } catch (error) {
        if (error instanceof TypeError) {
          this.queue = [command];
          this.state = next;
          return this.state;
        }
        await writeCache({ state: this.state, queue: [] });
        throw error;
      }
      this.state = remote;
      try {
        await writeCache({ state: remote, queue: [] });
      } catch {
        this.queue = [command];
        throw new DomainError(
          'Saved on the server, but updating the offline cache failed. Retry sync before making further changes.',
          {},
          507,
        );
      }
      return this.state;
    });
  }
  sync() {
    return this.serialize(async () => {
      while (this.queue.length) {
        const remote = await request('/api/commands', this.queue[0]);
        const rest = this.queue.slice(1);
        // Preserve subsequent local edits until the queue is completely acknowledged.
        const next = rest.length ? this.state : remote;
        await writeCache({ state: next, queue: rest });
        this.queue = rest;
        this.state = next;
      }
      return this.state;
    });
  }
  reloadServer() {
    return this.serialize(async () => {
      const remote = await request('/api/collection');
      await writeCache({ state: remote, queue: [] });
      this.queue = [];
      this.state = remote;
      return remote;
    });
  }
}
