import { z } from 'zod';

export const wineTypes = [
  'Champagne',
  'Franciacorta',
  'Prosecco',
  'Other sparkling',
  'Red',
  'White',
  'Rosé',
  'Dessert',
  'Fortified',
  'Other',
];
export const origins = [
  'Gift',
  'Wine shop',
  'Grocery',
  'Trip',
  'Winery visit',
  'Online purchase',
  'Auction',
  'Other',
];
export const bottleSizes = [
  '375 ml',
  '750 ml',
  '1.5 l (Magnum)',
  '3 l',
  'Other',
];
const text = z.string().max(2000);
const optionalNumber = z.number().finite().optional();
const date = z
  .string()
  .refine(
    (s) =>
      /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      !Number.isNaN(Date.parse(s)) &&
      new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s,
    'Enter a valid date',
  );
export const photoSchema = z.object({
  src: z
    .string()
    .max(3_000_000)
    .regex(
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/,
      'Photo must be a compressed JPEG, PNG or WebP image',
    ),
  alt: z.string().min(1).max(500),
});
export const eventSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'added',
    'edited',
    'moved',
    'opened',
    'quantity changed',
    'opening undone',
  ]),
  date: z.string().min(1),
  description: text,
  quantity: z.number().int().nonnegative().optional(),
  occasion: text.optional(),
  people: text.optional(),
  rating: z.number().int().min(1).max(5).optional(),
  notes: text.optional(),
  undone: z.boolean().optional(),
  previousRating: optionalNumber,
  previousNotes: text.optional(),
});
export const bottleSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1, 'Name is required').max(120),
    producer: text.default(''),
    type: z.string().min(1, 'Wine type is required').max(100),
    vintage: z
      .string()
      .default('')
      .refine(
        (s) =>
          s === '' ||
          s === 'NV' ||
          (/^\d{4}$/.test(s) && +s >= 1800 && +s <= new Date().getFullYear()),
        `Vintage must be NV or a year between 1800 and ${new Date().getFullYear()}`,
      ),
    country: text.default(''),
    region: text.default(''),
    appellation: text.default(''),
    grapes: z.array(text).max(50).default([]),
    abv: z
      .number()
      .min(0, 'ABV must be between 0 and 25 with one decimal')
      .max(25, 'ABV must be between 0 and 25 with one decimal')
      .refine(
        (n) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-8,
        'ABV must be between 0 and 25 with one decimal',
      )
      .optional(),
    size: text.default('750 ml'),
    sweetness: text.default(''),
    quantity: z
      .number({
        required_error: 'Quantity is required',
        invalid_type_error: 'Quantity must be a whole number',
      })
      .int('Quantity must be a whole number')
      .nonnegative('Quantity must be 0 or more')
      .max(100000),
    cellarId: z.string().min(1, 'Cellar is required'),
    position: text.default(''),
    datePlaced: date,
    origin: z.string().min(1, 'Origin is required').max(100),
    originDetails: text.default(''),
    giftedBy: text.default(''),
    occasion: text.default(''),
    shopName: text.default(''),
    trip: text.default(''),
    price: z.number().finite().nonnegative().optional(),
    value: z.number().finite().nonnegative().optional(),
    drinkFrom: z.number().int().min(1800).max(2200).optional(),
    drinkBy: z.number().int().min(1800).max(2200).optional(),
    servingMin: z.number().min(0).max(30).optional(),
    servingMax: z.number().min(0).max(30).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    notes: text.default(''),
    tags: z.array(text).max(50).default([]),
    photos: z.array(photoSchema).max(4, 'Maximum 3 extra photos').default([]),
    history: z.array(eventSchema).default([]),
    pairings: z.array(text).default([]),
    feedback: z.record(z.enum(['like', 'dislike'])).default({}),
    barcode: text.default(''),
  })
  .superRefine((b, ctx) => {
    if (
      b.drinkFrom !== undefined &&
      b.drinkBy !== undefined &&
      b.drinkFrom > b.drinkBy
    )
      ctx.addIssue({
        code: 'custom',
        path: ['drinkBy'],
        message: 'Drink by must not be before drink from',
      });
    if (
      b.servingMin !== undefined &&
      b.servingMax !== undefined &&
      b.servingMin > b.servingMax
    )
      ctx.addIssue({
        code: 'custom',
        path: ['servingMax'],
        message: 'Maximum must not be below minimum',
      });
  });
export const cellarSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Name is required').max(60),
  description: z.string().max(500).default(''),
  location: text.default(''),
  kind: text.default('Room'),
  temperature: z
    .number()
    .min(0)
    .max(25)
    .refine(
      (n) => Number.isInteger(n * 2),
      'Allowed range 0–25 °C in steps of 0.5',
    ),
  humidity: z.number().min(0).max(100).optional(),
  capacity: z.number().int().positive().max(100000).optional(),
  shelves: z.number().int().min(1).max(50).default(6),
  positions: z.number().int().min(1).max(50).default(10),
  recommendedTypes: z.array(text).default([]),
  notes: text.default(''),
  readings: z
    .array(
      z.object({
        date: z.string(),
        temperature: z.number().min(-20).max(60),
        humidity: z.number().min(0).max(100).optional(),
      }),
    )
    .default([]),
});
const optionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  hidden: z.boolean().default(false),
});
export const settingsSchema = z.object({
  unit: z.enum(['C', 'F']).default('C'),
  currency: z.enum(['EUR', 'USD', 'GBP', 'CHF']).default('EUR'),
  language: z.enum(['en', 'it']).default('en'),
  dateFormat: z
    .enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'])
    .default('DD/MM/YYYY'),
  defaultCellar: z.string().default(''),
  theme: z.enum(['system', 'light', 'dark', 'contrast']).default('system'),
  textSize: z.number().min(100).max(200).default(100),
  reducedMotion: z.boolean().default(false),
  notificationDuration: z.number().int().min(10).max(120).default(15),
  lowStock: z.number().int().min(0).max(100).default(2),
  lists: z
    .object({
      types: z.array(optionSchema).min(1),
      origins: z.array(optionSchema).min(1),
      sizes: z.array(optionSchema).min(1),
      tags: z.array(optionSchema),
    })
    .default({
      types: wineTypes.map((name) => ({ name, hidden: false })),
      origins: origins.map((name) => ({ name, hidden: false })),
      sizes: bottleSizes.map((name) => ({ name, hidden: false })),
      tags: [],
    }),
  dismissedAlerts: z.array(z.string()).default([]),
  noticeDismissed: z.boolean().default(false),
  savedViews: z
    .array(z.object({ name: text, filters: z.record(z.string()) }))
    .default([]),
});
export const collectionSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    cellars: z.array(cellarSchema).max(1000),
    bottles: z.array(bottleSchema).max(10000),
    settings: settingsSchema,
  })
  .superRefine((data, ctx) => {
    const ids = new Set(data.cellars.map((c) => c.id));
    if (
      ids.size !== data.cellars.length ||
      new Set(data.bottles.map((b) => b.id)).size !== data.bottles.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate record identifiers' });
    if (
      new Set(data.cellars.map((c) => c.name.trim().toLowerCase())).size !==
      data.cellars.length
    )
      ctx.addIssue({ code: 'custom', message: 'Cellar names must be unique' });
    data.bottles.forEach((b, index) => {
      if (!ids.has(b.cellarId))
        ctx.addIssue({
          code: 'custom',
          path: ['bottles', index, 'cellarId'],
          message: 'Unknown cellar reference',
        });
    });
    if (data.settings.defaultCellar && !ids.has(data.settings.defaultCellar))
      ctx.addIssue({
        code: 'custom',
        message: 'Default cellar does not exist',
      });
  });
export type Bottle = z.infer<typeof bottleSchema>;
export type Cellar = z.infer<typeof cellarSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type HistoryEvent = z.infer<typeof eventSchema>;
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const emptyCollection = (): Collection => ({
  version: 1,
  revision: 0,
  cellars: [],
  bottles: [],
  settings: settingsSchema.parse({}),
});
export function newBottle(id: string, cellarId = ''): Bottle {
  return {
    id,
    name: '',
    type: '',
    quantity: 1,
    cellarId,
    origin: '',
    datePlaced: today(),
    producer: '',
    vintage: '',
    country: '',
    region: '',
    appellation: '',
    grapes: [],
    size: '750 ml',
    sweetness: '',
    position: '',
    originDetails: '',
    giftedBy: '',
    occasion: '',
    shopName: '',
    trip: '',
    notes: '',
    tags: [],
    photos: [],
    history: [],
    pairings: [],
    feedback: {},
    barcode: '',
  };
}
export function drinkingStatus(
  b: Pick<Bottle, 'drinkFrom' | 'drinkBy'>,
  year = new Date().getFullYear(),
) {
  if (b.drinkFrom !== undefined && year < b.drinkFrom) return 'Too young';
  if (b.drinkBy !== undefined && year > b.drinkBy) return 'Past peak';
  if (b.drinkBy !== undefined && b.drinkBy <= year + 1) return 'Drink soon';
  return 'Ready';
}
export const occupancy = (s: Collection, id: string) =>
  s.bottles
    .filter((b) => b.cellarId === id)
    .reduce((n, b) => n + b.quantity, 0);
export function summary(s: Collection) {
  const live = s.bottles.filter((b) => b.quantity > 0);
  return {
    total: live.reduce((n, b) => n + b.quantity, 0),
    distinct: new Set(
      live.map((b) =>
        [
          b.name.toLowerCase(),
          b.producer.toLowerCase(),
          b.vintage,
          b.size,
        ].join('|'),
      ),
    ).size,
    cellars: s.cellars.length,
    ready: live
      .filter((b) => drinkingStatus(b) === 'Ready')
      .reduce((n, b) => n + b.quantity, 0),
    soon: live
      .filter((b) => drinkingStatus(b) === 'Drink soon')
      .reduce((n, b) => n + b.quantity, 0),
    value: live.reduce((n, b) => n + b.quantity * (b.value ?? b.price ?? 0), 0),
  };
}
export function searchBottle(b: Bottle, query: string) {
  return [
    b.name,
    b.producer,
    b.country,
    b.region,
    b.appellation,
    ...b.grapes,
    ...b.tags,
    b.notes,
  ]
    .join(' ')
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}
export function filtersMatch(b: Bottle, f: Record<string, string>) {
  const numeric: Record<string, number | undefined> = {
    vintage: /^\d+$/.test(b.vintage) ? +b.vintage : undefined,
    abv: b.abv,
    price: b.price,
    rating: b.rating,
  };
  return Object.entries(f).every(([key, value]) => {
    if (!value) return true;
    if (key === 'query') return searchBottle(b, value);
    if (key === 'status') return drinkingStatus(b) === value;
    if (key === 'country' || key === 'region')
      return b[key].toLowerCase().includes(value.toLowerCase());
    if (key.endsWith('Min') || key.endsWith('Max')) {
      const n = numeric[key.slice(0, -3)];
      return (
        n !== undefined && (key.endsWith('Min') ? n >= +value : n <= +value)
      );
    }
    if (key === 'type' || key === 'cellarId' || key === 'origin')
      return b[key] === value;
    return true;
  });
}
export function temperature(c: number, unit: Settings['unit']) {
  return `${Number((unit === 'F' ? c * 1.8 + 32 : c).toFixed(1))} °${unit}`;
}
export function formatDate(date: string, format: Settings['dateFormat']) {
  const [y, m, d] = date.slice(0, 10).split('-');
  return format === 'DD/MM/YYYY'
    ? `${d}/${m}/${y}`
    : format === 'MM/DD/YYYY'
      ? `${m}/${d}/${y}`
      : `${y}-${m}-${d}`;
}
export function alerts(s: Collection) {
  return [
    ...s.bottles
      .filter(
        (b) =>
          b.quantity > 0 &&
          ['Drink soon', 'Past peak'].includes(drinkingStatus(b)),
      )
      .map((b) => ({
        id: `window:${b.id}:${b.drinkBy}`,
        text: `${b.name}: ${drinkingStatus(b)} (${b.drinkBy})`,
        bottleId: b.id,
      })),
    ...s.cellars
      .filter(
        (c) => c.capacity !== undefined && occupancy(s, c.id) >= c.capacity,
      )
      .map((c) => ({
        id: `full:${c.id}:${c.capacity}`,
        text: `${c.name}: cellar full`,
        bottleId: '',
      })),
    ...s.bottles
      .filter((b) => b.quantity > 0 && b.quantity <= s.settings.lowStock)
      .map((b) => ({
        id: `stock:${b.id}:${b.quantity}`,
        text: `${b.name}: low stock (${b.quantity})`,
        bottleId: b.id,
      })),
  ].filter((a) => !s.settings.dismissedAlerts.includes(a.id));
}
