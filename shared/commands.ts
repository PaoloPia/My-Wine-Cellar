import { z } from 'zod';
import {
  bottleSchema,
  cellarSchema,
  collectionSchema,
  emptyCollection,
  settingsSchema,
  type Collection,
  type Bottle,
  type HistoryEvent,
} from './model';

const ids = z
  .array(z.string().min(1))
  .min(1)
  .max(10000)
  .refine((v) => new Set(v).size === v.length, 'Select each bottle only once');
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('saveBottle'), bottle: bottleSchema }),
  z.object({ type: z.literal('saveCellar'), cellar: cellarSchema }),
  z.object({ type: z.literal('deleteBottles'), ids }),
  z.object({
    type: z.literal('restoreBottles'),
    bottles: z.array(bottleSchema).min(1),
  }),
  z.object({
    type: z.literal('deleteCellar'),
    id: z.string(),
    moveTo: z.string().optional(),
    deleteContents: z.boolean().optional(),
  }),
  z.object({ type: z.literal('restoreCellar'), cellar: cellarSchema }),
  z.object({
    type: z.literal('undoCellarDeletion'),
    cellar: cellarSchema,
    bottles: z.array(bottleSchema),
    moved: z.boolean(),
  }),
  z.object({
    type: z.literal('move'),
    ids,
    cellarId: z.string().min(1),
    position: z.string().max(2000),
  }),
  z.object({
    type: z.literal('tag'),
    ids,
    tag: z.string().trim().min(1).max(100),
  }),
  z.object({
    type: z.literal('quantity'),
    id: z.string(),
    delta: z.union([z.literal(1), z.literal(-1)]),
  }),
  z.object({
    type: z.literal('open'),
    id: z.string(),
    quantity: z.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    occasion: z.string().max(2000),
    people: z.string().max(2000),
    rating: z.number().int().min(1).max(5).optional(),
    notes: z.string().max(2000),
  }),
  z.object({ type: z.literal('undoOpen'), id: z.string() }),
  z.object({ type: z.literal('settings'), settings: settingsSchema }),
  z.object({ type: z.literal('restore'), collection: collectionSchema }),
  z.object({
    type: z.literal('import'),
    bottles: z.array(bottleSchema).min(1).max(10000),
  }),
  z.object({
    type: z.literal('clear'),
    confirmation: z.literal('DELETE ALL DATA'),
  }),
]);
export const commandSchema = z.object({
  id: z.string().min(1).max(100),
  expectedRevision: z.number().int().nonnegative(),
  date: z.string().datetime(),
  action: actionSchema,
});
export type Action = z.infer<typeof actionSchema>;
export type Command = z.infer<typeof commandSchema>;
export class DomainError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string> = {},
    public status = 400,
  ) {
    super(message);
  }
}
export function fieldsFromError(error: z.ZodError) {
  return Object.fromEntries(
    error.issues.map((i) => [i.path.join('.'), i.message]),
  );
}
export function applyCommand(original: Collection, input: Command): Collection {
  const command = commandSchema.parse(input);
  if (command.expectedRevision !== original.revision)
    throw new DomainError(
      'The collection changed elsewhere. Export your local backup before reloading the server collection.',
      {},
      409,
    );
  const s = structuredClone(original);
  const a = command.action;
  const event = (
    b: Bottle,
    kind: HistoryEvent['kind'],
    description: string,
    extra: Partial<HistoryEvent> = {},
  ) =>
    b.history.push({
      id: command.id,
      kind,
      date: command.date,
      description,
      ...extra,
    });
  const bottle = (id: string) => {
    const b = s.bottles.find((b) => b.id === id);
    if (!b) throw new DomainError('Bottle not found', {}, 404);
    return b;
  };
  const cellar = (id: string) => {
    const c = s.cellars.find((c) => c.id === id);
    if (!c)
      throw new DomainError('Select an existing cellar', {
        cellarId: 'Cellar does not exist',
      });
    return c;
  };
  switch (a.type) {
    case 'saveBottle': {
      cellar(a.bottle.cellarId);
      const previous = s.bottles.find((b) => b.id === a.bottle.id);
      const b = { ...a.bottle, history: previous?.history ?? [] };
      if (previous?.cellarId !== b.cellarId && previous)
        event(
          b,
          'moved',
          `Moved from ${cellar(previous.cellarId).name} to ${cellar(b.cellarId).name}`,
        );
      if (previous && previous.quantity !== b.quantity)
        event(
          b,
          'quantity changed',
          `Quantity ${previous.quantity} → ${b.quantity}`,
        );
      event(
        b,
        previous ? 'edited' : 'added',
        previous ? 'Bottle details updated' : 'Added to collection',
      );
      s.bottles = previous
        ? s.bottles.map((v) => (v.id === b.id ? b : v))
        : [...s.bottles, b];
      break;
    }
    case 'saveCellar': {
      if (
        s.cellars.some(
          (c) =>
            c.id !== a.cellar.id &&
            c.name.toLowerCase() === a.cellar.name.toLowerCase(),
        )
      )
        throw new DomainError('A cellar with this name already exists', {
          name: 'A cellar with this name already exists',
        });
      s.cellars = s.cellars.some((c) => c.id === a.cellar.id)
        ? s.cellars.map((c) => (c.id === a.cellar.id ? a.cellar : c))
        : [...s.cellars, a.cellar];
      break;
    }
    case 'deleteBottles':
      a.ids.forEach(bottle);
      s.bottles = s.bottles.filter((b) => !a.ids.includes(b.id));
      break;
    case 'restoreBottles': {
      a.bottles.forEach((b) => {
        cellar(b.cellarId);
        if (s.bottles.some((v) => v.id === b.id))
          throw new DomainError('Bottle already exists');
      });
      s.bottles.push(...a.bottles);
      break;
    }
    case 'deleteCellar': {
      const source = cellar(a.id);
      const contained = s.bottles.filter((b) => b.cellarId === a.id);
      if (contained.length && !a.moveTo && !a.deleteContents)
        throw new DomainError(
          'This cellar contains bottles. Move them to another cellar or explicitly delete its contents.',
        );
      if (a.moveTo) {
        if (a.moveTo === a.id)
          throw new DomainError('Select a different destination cellar');
        const target = cellar(a.moveTo);
        contained.forEach((b) => {
          b.cellarId = target.id;
          b.position = '';
          event(b, 'moved', `Moved from ${source.name} to ${target.name}`);
        });
      } else if (a.deleteContents)
        s.bottles = s.bottles.filter((b) => b.cellarId !== a.id);
      s.cellars = s.cellars.filter((c) => c.id !== a.id);
      if (s.settings.defaultCellar === a.id) s.settings.defaultCellar = '';
      break;
    }
    case 'restoreCellar': {
      if (
        s.cellars.some(
          (c) =>
            c.id === a.cellar.id ||
            c.name.toLowerCase() === a.cellar.name.toLowerCase(),
        )
      )
        throw new DomainError('Cellar already exists');
      s.cellars.push(a.cellar);
      break;
    }
    case 'undoCellarDeletion': {
      if (
        s.cellars.some(
          (c) =>
            c.id === a.cellar.id ||
            c.name.toLowerCase() === a.cellar.name.toLowerCase(),
        )
      )
        throw new DomainError('A cellar with this name already exists');
      for (const old of a.bottles) {
        const current = s.bottles.find((b) => b.id === old.id);
        if (a.moved) {
          if (
            !current ||
            current.history.length !== old.history.length + 1 ||
            current.history.at(-1)?.kind !== 'moved'
          )
            throw new DomainError(
              'A moved bottle has changed since deletion. Undo cannot overwrite newer changes.',
            );
        } else if (current)
          throw new DomainError('A deleted bottle has already been restored');
      }
      s.cellars.push(a.cellar);
      const restored = new Set(a.bottles.map((b) => b.id));
      s.bottles = [
        ...s.bottles.filter((b) => !restored.has(b.id)),
        ...a.bottles,
      ];
      break;
    }
    case 'move': {
      const target = cellar(a.cellarId);
      a.ids.forEach((id) => {
        const b = bottle(id);
        const from = cellar(b.cellarId).name;
        b.cellarId = target.id;
        b.position = a.position;
        event(
          b,
          'moved',
          `Moved from ${from} to ${target.name}, ${a.position || 'unassigned position'}`,
        );
      });
      break;
    }
    case 'tag':
      a.ids.forEach((id) => {
        const b = bottle(id);
        b.tags = [...new Set([...b.tags, a.tag])];
        event(b, 'edited', `Tag added: ${a.tag}`);
      });
      break;
    case 'quantity': {
      const b = bottle(a.id);
      if (b.quantity + a.delta < 0)
        throw new DomainError('Quantity cannot be negative');
      b.quantity += a.delta;
      event(b, 'quantity changed', `Quantity changed to ${b.quantity}`);
      break;
    }
    case 'open': {
      const b = bottle(a.id);
      if (a.quantity > b.quantity)
        throw new DomainError(`Only ${b.quantity} bottles in stock`, {
          quantity: `Only ${b.quantity} bottles in stock`,
        });
      if (
        Number.isNaN(Date.parse(a.date)) ||
        new Date(`${a.date}T12:00:00Z`).toISOString().slice(0, 10) !== a.date
      )
        throw new DomainError('Enter a valid opening date', {
          date: 'Enter a valid date',
        });
      event(b, 'opened', `Opened ${a.quantity} bottle(s)`, {
        date: a.date,
        quantity: a.quantity,
        occasion: a.occasion,
        people: a.people,
        rating: a.rating,
        notes: a.notes,
        previousRating: b.rating,
        previousNotes: b.notes,
      });
      b.quantity -= a.quantity;
      if (a.rating !== undefined) b.rating = a.rating;
      if (a.notes) b.notes = a.notes;
      break;
    }
    case 'undoOpen': {
      const b = bottle(a.id);
      const last = [...b.history]
        .reverse()
        .find((e) => e.kind === 'opened' && !e.undone);
      if (!last) throw new DomainError('No opening event to undo');
      if (b.history.at(-1)?.id !== last.id)
        throw new DomainError('Only the last unchanged opening can be undone');
      b.quantity += last.quantity ?? 0;
      b.rating = last.previousRating;
      b.notes = last.previousNotes ?? '';
      last.undone = true;
      event(b, 'opening undone', 'Last opening undone');
      break;
    }
    case 'settings': {
      const rename = (
        key: keyof Collection['settings']['lists'],
        value: string,
      ) => {
        const index = s.settings.lists[key].findIndex(
          (option) => option.name === value,
        );
        return index >= 0
          ? (a.settings.lists[key][index]?.name ?? value)
          : value;
      };
      s.bottles.forEach((b) => {
        b.type = rename('types', b.type);
        b.origin = rename('origins', b.origin);
        b.size = rename('sizes', b.size);
        b.tags = b.tags.map((tag) => rename('tags', tag));
      });
      s.settings = a.settings;
      break;
    }
    case 'restore':
      return collectionSchema.parse({
        ...a.collection,
        revision: original.revision + 1,
      });
    case 'import': {
      a.bottles.forEach((b) => {
        cellar(b.cellarId);
        if (s.bottles.some((v) => v.id === b.id))
          throw new DomainError('Import contains an existing bottle ID');
        event(b, 'added', 'Imported from CSV');
        s.bottles.push(b);
      });
      break;
    }
    case 'clear':
      return { ...emptyCollection(), revision: original.revision + 1 };
  }
  return collectionSchema.parse({ ...s, revision: original.revision + 1 });
}
