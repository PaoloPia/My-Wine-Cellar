import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { applyCommand, type Action } from '../shared/commands';
import {
  alerts,
  bottleSchema,
  cellarSchema,
  collectionSchema,
  drinkingStatus,
  filtersMatch,
  newBottle,
  occupancy,
  settingsSchema,
  summary,
  temperature,
  type Collection,
} from '../shared/model';
import { exportCsv, parseCsv, validateCsv } from '../shared/csv';
import { pairingsFor, reversePairing, serving } from '../shared/pairings';
import { fixture, command } from './helpers';
const exec = (s: Collection, action: Action) =>
  applyCommand(s, command(s, action));

describe('Spreadsheet boundary and business scenarios', () => {
  it('TC-002/003: backup round-trip includes photos, settings and history; malformed versions and dangling references fail atomically', () => {
    let s = exec(fixture(), {
      type: 'open',
      id: 'b1',
      quantity: 2,
      date: '2026-11-06',
      occasion: 'Anniversary',
      people: '4',
      rating: 5,
      notes: 'Fine bubbles',
    });
    const backup = JSON.parse(JSON.stringify(s));
    const cleared = exec(s, { type: 'clear', confirmation: 'DELETE ALL DATA' });
    s = exec(cleared, { type: 'restore', collection: backup });
    expect({ ...s, revision: backup.revision }).toEqual(backup);
    expect(() => collectionSchema.parse({ ...backup, version: 2 })).toThrow();
    expect(() => collectionSchema.parse({ ...backup, cellars: [] })).toThrow();
    expect(s.bottles[0].photos[0].alt).toBe('Franciacorta label');
  });
  it('TC-007/008: KPIs and cellar occupancy sum physical quantities, not wine entries', () => {
    const s = fixture();
    const total = summary(s);
    expect(total).toMatchObject({
      total: 9,
      distinct: 2,
      cellars: 2,
      value: 336,
    });
    expect(occupancy(s, 'fridge')).toBe(6);
    const b = {
      ...newBottle('b3', 'fridge'),
      name: 'Etna',
      type: 'White',
      quantity: 2,
      origin: 'Other',
      price: 25,
    };
    expect(summary(exec(s, { type: 'saveBottle', bottle: b })).value).toBe(386);
  });
  it('TC-009/010: cellar unique names ignore case and surrounding spaces; Fahrenheit is presentation only', () => {
    const s = fixture();
    expect(temperature(8, 'F')).toBe('46.4 °F');
    expect(() =>
      exec(s, {
        type: 'saveCellar',
        cellar: cellarSchema.parse({
          id: 'new',
          name: 'sparkling fridge ',
          temperature: 8,
        }),
      }),
    ).toThrow('already exists');
    expect(() =>
      cellarSchema.parse({ id: 'new', name: '', temperature: 8 }),
    ).toThrow();
    expect(s.cellars[0].temperature).toBe(8);
  });
  it.each([-0.5, 12.3, 25.5, NaN])(
    'TC-011: rejects invalid temperature %s',
    (temperature) => {
      expect(
        cellarSchema.safeParse({ id: 'test', name: 'Test', temperature })
          .success,
      ).toBe(false);
    },
  );
  it.each([0, 0.5, 25])('TC-011: accepts temperature %s', (temperature) => {
    expect(
      cellarSchema.safeParse({ id: 'test', name: 'Test', temperature }).success,
    ).toBe(true);
  });
  it('TC-012: occupied cellar deletion is blocked or moves every entry with a history event', () => {
    const s = fixture();
    expect(() => exec(s, { type: 'deleteCellar', id: 'fridge' })).toThrow(
      'contains bottles',
    );
    const moved = exec(s, {
      type: 'deleteCellar',
      id: 'fridge',
      moveTo: 'red',
    });
    expect(moved.cellars).toHaveLength(1);
    expect(moved.bottles).toHaveLength(2);
    expect(moved.bottles[0].cellarId).toBe('red');
    expect(moved.bottles[0].history.at(-1)?.description).toContain(
      'Moved from Sparkling Fridge',
    );
    expect(() =>
      exec(s, { type: 'deleteCellar', id: 'fridge', moveTo: 'fridge' }),
    ).toThrow();
  });
  it('TC-014/015: validates mandatory fields, retains all optional identity and origin fields', () => {
    const b = fixture().bottles[0];
    expect(bottleSchema.parse(b)).toEqual(b);
    for (const key of ['name', 'type', 'origin', 'cellarId', 'datePlaced'])
      expect(bottleSchema.safeParse({ ...b, [key]: '' }).success).toBe(false);
    expect(bottleSchema.safeParse({ ...b, quantity: undefined }).success).toBe(
      false,
    );
  });
  it.each([0, 12.5, 25])('TC-016: accepts ABV %s', (abv) =>
    expect(
      bottleSchema.safeParse({ ...fixture().bottles[0], abv }).success,
    ).toBe(true),
  );
  it.each([-1, 25.1, 12.55, NaN])('TC-016: rejects ABV %s', (abv) =>
    expect(
      bottleSchema.safeParse({ ...fixture().bottles[0], abv }).success,
    ).toBe(false),
  );
  it.each(['NV', '1800', '', String(new Date().getFullYear())])(
    'TC-017: accepts vintage %s',
    (vintage) =>
      expect(
        bottleSchema.safeParse({ ...fixture().bottles[0], vintage }).success,
      ).toBe(true),
  );
  it.each(['1799', '19A9', String(new Date().getFullYear() + 1)])(
    'TC-017: rejects vintage %s',
    (vintage) =>
      expect(
        bottleSchema.safeParse({ ...fixture().bottles[0], vintage }).success,
      ).toBe(false),
  );
  it.each([0, 1, 999])('TC-018: accepts quantity %s', (quantity) =>
    expect(
      bottleSchema.safeParse({ ...fixture().bottles[0], quantity }).success,
    ).toBe(true),
  );
  it.each([-1, 2.5, undefined])('TC-018: rejects quantity %s', (quantity) =>
    expect(
      bottleSchema.safeParse({ ...fixture().bottles[0], quantity }).success,
    ).toBe(false),
  );
  it('TC-019/020/021: edits, duplicates, moves, archives and restores without losing history', () => {
    let s = fixture();
    s = exec(s, {
      type: 'saveBottle',
      bottle: { ...s.bottles[0], price: 48, tags: ['gift-idea'] },
    });
    const copy = { ...s.bottles[0], id: 'copy', vintage: '2017', history: [] };
    s = exec(s, { type: 'saveBottle', bottle: copy });
    expect(s.bottles.find((b) => b.id === 'b1')?.vintage).toBe('2019');
    s = exec(s, {
      type: 'move',
      ids: ['copy'],
      cellarId: 'red',
      position: '1/2',
    });
    expect(s.bottles.find((b) => b.id === 'copy')?.history.at(-1)?.kind).toBe(
      'moved',
    );
    s = exec(s, {
      type: 'saveBottle',
      bottle: { ...s.bottles[0], quantity: 1 },
    });
    s = exec(s, { type: 'quantity', id: 'b1', delta: -1 });
    expect(s.bottles[0].quantity).toBe(0);
    expect(() => exec(s, { type: 'quantity', id: 'b1', delta: -1 })).toThrow();
    s = exec(s, { type: 'quantity', id: 'b1', delta: 1 });
    expect(s.bottles[0].quantity).toBe(1);
  });
  it('TC-022: computes all four drinking states deterministically for 2026', () => {
    expect(drinkingStatus({ drinkFrom: 2028, drinkBy: 2035 }, 2026)).toBe(
      'Too young',
    );
    expect(drinkingStatus({ drinkFrom: 2022, drinkBy: 2031 }, 2026)).toBe(
      'Ready',
    );
    expect(drinkingStatus({ drinkFrom: 2020, drinkBy: 2027 }, 2026)).toBe(
      'Drink soon',
    );
    expect(drinkingStatus({ drinkFrom: 2015, drinkBy: 2025 }, 2026)).toBe(
      'Past peak',
    );
  });
  it('TC-023/025: limits photos and requires descriptions; backup rejects external images', () => {
    const b = fixture().bottles[0];
    expect(
      bottleSchema.safeParse({ ...b, photos: Array(4).fill(b.photos[0]) })
        .success,
    ).toBe(true);
    expect(
      bottleSchema.safeParse({ ...b, photos: Array(5).fill(b.photos[0]) })
        .success,
    ).toBe(false);
    expect(
      bottleSchema.safeParse({ ...b, photos: [{ ...b.photos[0], alt: '' }] })
        .success,
    ).toBe(false);
    expect(
      bottleSchema.safeParse({
        ...b,
        photos: [{ src: 'https://tracking.example/photo.jpg', alt: 'wine' }],
      }).success,
    ).toBe(false);
  });
  it('TC-027/028: search across producer, grapes, tags and notes; filters intersect and respect missing numeric values', () => {
    const b = fixture().bottles[0];
    for (const query of [
      'Esempio',
      'lombardy',
      'CHARDONNAY',
      'anniversary',
      'cherry',
    ])
      expect(filtersMatch(b, { query })).toBe(true);
    expect(
      filtersMatch(b, {
        type: 'Franciacorta',
        cellarId: 'fridge',
        vintageMin: '2015',
        abvMin: '12',
        priceMax: '50',
      }),
    ).toBe(true);
    expect(filtersMatch(b, { type: 'Red' })).toBe(false);
    expect(filtersMatch({ ...b, abv: undefined }, { abvMax: '25' })).toBe(
      false,
    );
  });
  it('TC-029/006: bulk move/tag/delete/undo applies exactly to selected records and fails atomically', () => {
    let s = fixture();
    const original = structuredClone(s.bottles[0]);
    s = exec(s, { type: 'tag', ids: ['b1'], tag: 'party' });
    expect(s.bottles[0].tags).toContain('party');
    expect(s.bottles[1].tags).not.toContain('party');
    const deleted = s.bottles[0];
    s = exec(s, { type: 'deleteBottles', ids: ['b1'] });
    expect(s.bottles).toHaveLength(1);
    s = exec(s, { type: 'restoreBottles', bottles: [deleted] });
    expect(s.bottles.find((b) => b.id === 'b1')?.photos).toEqual(
      original.photos,
    );
    expect(() =>
      exec(s, {
        type: 'move',
        ids: ['b1', 'missing'],
        cellarId: 'red',
        position: '',
      }),
    ).toThrow();
    expect(s.bottles.find((b) => b.id === 'b1')?.cellarId).toBe('fridge');
  });
  it('TC-030/031: every wine type has 3+ offline pairings, characteristics change suggestions, reverse search excludes archived stock', () => {
    const b = fixture().bottles[0];
    for (const type of [
      'Champagne',
      'Franciacorta',
      'Prosecco',
      'Other sparkling',
      'Red',
      'White',
      'Rosé',
      'Dessert',
      'Fortified',
      'Custom',
    ])
      expect(pairingsFor({ ...b, type }).length).toBeGreaterThanOrEqual(3);
    expect(
      serving({ ...b, type: 'Red', grapes: ['Pinot Noir'] }).dishes,
    ).toContain('Mushrooms');
    expect(serving({ ...b, sweetness: 'Sweet' }).dishes).toContain(
      'Dark chocolate',
    );
    expect(
      pairingsFor({
        ...b,
        pairings: ['My dish'],
        feedback: { 'My dish': 'like' },
      })[0].dish,
    ).toBe('My dish');
    expect(
      reversePairing(
        [b, { ...b, id: 'archived', quantity: 0 }],
        'seafood risotto',
      ).map((r) => r.bottle.id),
    ).toEqual(['b1']);
  });
  it('TC-032/033: opening decreases stock, records journal fields, blocks overdraw and restores prior notes/rating', () => {
    const s = fixture();
    const b = s.bottles[0];
    expect(() =>
      exec(s, {
        type: 'open',
        id: b.id,
        quantity: 7,
        date: '2026-11-06',
        occasion: '',
        people: '',
        notes: '',
      }),
    ).toThrow('Only 6');
    const opened = exec(s, {
      type: 'open',
      id: b.id,
      quantity: 2,
      date: '2026-11-06',
      occasion: 'Anniversary',
      people: '4',
      notes: 'Fine bubbles',
      rating: 5,
    });
    expect(opened.bottles[0].quantity).toBe(4);
    expect(opened.bottles[0].history.at(-1)).toMatchObject({
      kind: 'opened',
      quantity: 2,
      occasion: 'Anniversary',
      people: '4',
      rating: 5,
      notes: 'Fine bubbles',
    });
    const undone = exec(opened, { type: 'undoOpen', id: b.id });
    expect(undone.bottles[0].quantity).toBe(6);
    expect(undone.bottles[0].notes).toBe('cherry');
    expect(undone.bottles[0].history[0].undone).toBe(true);
  });
  it('TC-034: alerts include windows, full capacity and low stock; dismissal persists in collection', () => {
    const s = fixture();
    s.cellars[0].capacity = 6;
    s.bottles[0].drinkBy = new Date().getFullYear();
    s.bottles[1].quantity = 1;
    const all = alerts(s);
    expect(all.length).toBeGreaterThanOrEqual(3);
    s.settings.dismissedAlerts = [all[0].id];
    expect(alerts(JSON.parse(JSON.stringify(s)))).not.toContainEqual(all[0]);
  });
  it('TC-036/038: accented CSV round-trip, column mapping, validation report and valid-only partial import', () => {
    const s = fixture();
    s.bottles[0].name = 'Rosé, "Montagna"';
    const parsed = parseCsv(exportCsv(s.bottles, s));
    expect(parsed.rows[0].name).toBe('Rosé, "Montagna"');
    const mapped = validateCsv(
      [
        { Wine: 'Valid', Alc: '12.5' },
        { Wine: 'Bad ABV', Alc: '30' },
        { Wine: '', Alc: '12' },
      ],
      { Wine: 'name', Alc: 'abv' },
      s,
      randomUUID,
    );
    expect(mapped.valid).toHaveLength(1);
    expect(mapped.errors).toHaveLength(2);
    const imported = exec(s, { type: 'import', bottles: mapped.valid });
    expect(imported.bottles).toHaveLength(3);
    const roundtrip = validateCsv(
      parsed.rows,
      Object.fromEntries(parsed.headers.map((k) => [k, k])),
      s,
      randomUUID,
    );
    expect(roundtrip.errors).toEqual([]);
    expect(roundtrip.valid[0].grapes).toEqual(s.bottles[0].grapes);
  });
  it('TC-037: preferences and bounds validate; locale supports comma decimal in CSV', () => {
    const s = fixture();
    s.settings = settingsSchema.parse({
      ...s.settings,
      unit: 'F',
      currency: 'GBP',
      language: 'it',
      textSize: 200,
      notificationDuration: 20,
    });
    expect(
      validateCsv(
        [{ Wine: 'Vino', Alc: '12,5' }],
        { Wine: 'name', Alc: 'abv' },
        s,
        randomUUID,
      ).valid[0].abv,
    ).toBe(12.5);
    expect(
      settingsSchema.safeParse({ ...s.settings, notificationDuration: 5 })
        .success,
    ).toBe(false);
  });
  it('TC-049: filters handle 1,000 entries within the search budget', () => {
    const b = fixture().bottles[0];
    const data = Array.from({ length: 1000 }, (_, i) => ({
      ...b,
      id: String(i),
      name: i % 2 ? 'Barolo' : 'Franciacorta',
    }));
    const start = performance.now();
    expect(
      data.filter((b) => filtersMatch(b, { query: 'barolo' })),
    ).toHaveLength(500);
    expect(performance.now() - start).toBeLessThan(500);
  });
  it('TC-052: rejects stale revisions instead of overwriting another writer', () => {
    const s = fixture();
    const c = command(s, { type: 'quantity', id: 'b1', delta: 1 });
    const updated = applyCommand(s, c);
    expect(() => applyCommand(updated, c)).toThrow('changed elsewhere');
    expect(s.bottles[0].quantity).toBe(6);
  });
  it('TC-012/006: cellar deletion undo restores contents atomically and cannot overwrite later edits', () => {
    const original = fixture();
    const deleted = exec(original, {
      type: 'deleteCellar',
      id: 'fridge',
      moveTo: 'red',
    });
    const undo: Action = {
      type: 'undoCellarDeletion',
      cellar: original.cellars[0],
      bottles: [original.bottles[0]],
      moved: true,
    };
    const restored = exec(deleted, undo);
    expect(restored.cellars).toHaveLength(2);
    expect(restored.bottles.find((b) => b.id === 'b1')).toEqual(
      original.bottles[0],
    );
    const changed = exec(deleted, { type: 'quantity', id: 'b1', delta: 1 });
    expect(() => exec(changed, undo)).toThrow('changed since deletion');
  });
  it('TC-026/037: configurable origin rename updates existing references while hiding keeps recorded values', () => {
    const s = fixture();
    const settings = structuredClone(s.settings);
    settings.lists.origins[0] = { name: 'Birthday gift', hidden: true };
    settings.lists.origins.push({ name: 'Wine club', hidden: false });
    const result = exec(s, { type: 'settings', settings });
    expect(result.bottles[0].origin).toBe('Birthday gift');
    expect(result.bottles[0].giftedBy).toBe(s.bottles[0].giftedBy);
    expect(result.settings.lists.origins.at(-1)?.name).toBe('Wine club');
  });
});
