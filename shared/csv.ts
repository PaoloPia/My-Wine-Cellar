import Papa from 'papaparse';
import { bottleSchema, newBottle, type Bottle, type Collection } from './model';

export const csvFields = [
  'name',
  'producer',
  'type',
  'vintage',
  'country',
  'region',
  'appellation',
  'grapes',
  'abv',
  'size',
  'sweetness',
  'quantity',
  'cellar',
  'position',
  'datePlaced',
  'origin',
  'originDetails',
  'giftedBy',
  'occasion',
  'shopName',
  'trip',
  'price',
  'value',
  'drinkFrom',
  'drinkBy',
  'servingMin',
  'servingMax',
  'rating',
  'notes',
  'tags',
  'barcode',
] as const;
export function exportCsv(bottles: Bottle[], s: Collection) {
  return (
    '\uFEFF' +
    Papa.unparse(
      bottles.map((b) =>
        Object.fromEntries(
          csvFields.map((key) => {
            const value =
              key === 'cellar'
                ? (s.cellars.find((c) => c.id === b.cellarId)?.name ?? '')
                : b[key];
            return [
              key,
              Array.isArray(value) ? value.join('; ') : (value ?? ''),
            ];
          }),
        ),
      ),
      { columns: [...csvFields], escapeFormulae: true },
    )
  );
}
export function parseCsv(input: string) {
  const result = Papa.parse<Record<string, string>>(
    input.replace(/^\uFEFF/, ''),
    { header: true, skipEmptyLines: 'greedy' },
  );
  if (result.errors.length)
    throw new Error(
      result.errors
        .map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`)
        .join('; '),
    );
  if (!result.meta.fields?.length) throw new Error('CSV requires a header row');
  if (result.data.length > 10000)
    throw new Error('Maximum 10,000 rows per import');
  return { headers: result.meta.fields, rows: result.data };
}
export function validateCsv(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  s: Collection,
  createId: () => string,
) {
  const valid: Bottle[] = [];
  const errors: { row: number; message: string }[] = [];
  const numbers = [
    'abv',
    'price',
    'value',
    'drinkFrom',
    'drinkBy',
    'servingMin',
    'servingMax',
    'rating',
    'quantity',
  ];
  rows.forEach((row, index) => {
    const raw: Record<string, unknown> = {
      ...newBottle(
        createId(),
        s.settings.defaultCellar || s.cellars[0]?.id || '',
      ),
      type: 'Other',
      origin: 'Other',
    };
    for (const [header, key] of Object.entries(mapping)) {
      if (!key || !csvFields.includes(key as (typeof csvFields)[number]))
        continue;
      const value = row[header]?.trim() ?? '';
      if (key === 'cellar')
        raw.cellarId =
          s.cellars.find(
            (c) =>
              c.name.toLowerCase() === value.toLowerCase() || c.id === value,
          )?.id ?? '';
      else if (numbers.includes(key))
        raw[key] =
          value === ''
            ? undefined
            : Number(
                s.settings.language === 'it' ? value.replace(',', '.') : value,
              );
      else if (key === 'tags' || key === 'grapes')
        raw[key] = value
          .split(';')
          .map((v) => v.trim())
          .filter(Boolean);
      else raw[key] = value;
    }
    const parsed = bottleSchema.safeParse(raw);
    if (!parsed.success)
      errors.push({
        row: index + 2,
        message: parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      });
    else if (!s.cellars.some((c) => c.id === parsed.data.cellarId))
      errors.push({ row: index + 2, message: 'Cellar does not exist' });
    else valid.push(parsed.data);
  });
  return { valid, errors };
}
