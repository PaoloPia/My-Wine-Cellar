import { randomUUID } from 'node:crypto';
import type { Collection } from '../shared/model';
import type { Action, Command } from '../shared/commands';
export { fixture } from './fixture';
export function command(
  s: Collection,
  action: Action,
  id = randomUUID(),
): Command {
  return {
    id,
    expectedRevision: s.revision,
    date: new Date().toISOString(),
    action,
  };
}
