import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from './context';
import { Field, ErrorSummary, errorDetails, Modal, Rack } from './components';
import { Photos } from './photos';
import {
  bottleSchema,
  cellarSchema,
  newBottle,
  occupancy,
  today,
  temperature,
  type Bottle,
  type Cellar,
} from '../shared/model';
import { serving } from '../shared/pairings';

const listText = (values: string[]) => values.join(', ');
const parseList = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
export function BottleForm({ duplicate = false }: { duplicate?: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, t, mutate, busy } = useApp();
  const existing = state.bottles.find((b) => b.id === id);
  const [bottle, setBottle] = useState<Bottle>(() =>
    existing
      ? {
          ...structuredClone(existing),
          ...(duplicate
            ? { id: crypto.randomUUID(), history: [], datePlaced: today() }
            : {}),
        }
      : newBottle(crypto.randomUUID(), state.settings.defaultCellar),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [rawNumbers, setRawNumbers] = useState<Record<string, string>>({});
  const update = <K extends keyof Bottle>(key: K, value: Bottle[K]) => {
    setBottle((b) => ({ ...b, [key]: value }));
    setErrors((e) => {
      const copy = { ...e };
      delete copy[key];
      return copy;
    });
  };
  const field = (
    key: keyof Bottle,
    label: string,
    kind: 'text' | 'number' | 'date' | 'textarea' | 'list' = 'text',
    required = false,
    help?: string,
  ) => {
    const value = bottle[key];
    const raw =
      rawNumbers[key] ??
      (Array.isArray(value)
        ? listText(value as string[])
        : value === undefined
          ? ''
          : String(value));
    const attrs = {
      id: key,
      value: raw,
      required,
      list:
        key === 'country' || key === 'region'
          ? `${key}-suggestions`
          : undefined,
      'aria-invalid': !!errors[key],
      'aria-describedby':
        [errors[key] && `${key}-error`, help && `${key}-help`]
          .filter(Boolean)
          .join(' ') || undefined,
    };
    const onChange = (v: string) => {
      if (kind === 'number') {
        setRawNumbers((r) => ({ ...r, [key]: v }));
        const parsed =
          state.settings.language === 'it' ? v.replace(',', '.') : v;
        update(
          key,
          (v === '' ? undefined : Number(parsed)) as Bottle[typeof key],
        );
      } else
        update(key, (kind === 'list' ? parseList(v) : v) as Bottle[typeof key]);
    };
    return (
      <Field
        key={key}
        name={key}
        label={label}
        required={required}
        error={errors[key]}
        help={help}
      >
        {kind === 'textarea' ? (
          <textarea {...attrs} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input
            {...attrs}
            type={kind === 'date' ? 'date' : 'text'}
            inputMode={kind === 'number' ? 'decimal' : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </Field>
    );
  };
  const select = (
    key: 'type' | 'origin' | 'size' | 'sweetness' | 'cellarId' | 'rating',
    label: string,
    options: { value: string; label: string }[],
    required = false,
  ) => (
    <Field name={key} label={label} error={errors[key]} required={required}>
      <select
        id={key}
        value={bottle[key] ?? ''}
        required={required}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `${key}-error` : undefined}
        onChange={(e) => {
          if (key === 'rating')
            update('rating', e.target.value ? +e.target.value : undefined);
          else update(key, e.target.value);
          if (key === 'type') {
            const advice = serving({ ...bottle, type: e.target.value });
            setBottle((b) => ({
              ...b,
              type: e.target.value,
              servingMin: advice.min,
              servingMax: advice.max,
            }));
            setRawNumbers((r) => {
              const copy = { ...r };
              delete copy.servingMin;
              delete copy.servingMax;
              return copy;
            });
          }
        }}
      >
        <option value="">{t('Choose…')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
  const listOptions = (key: 'types' | 'origins' | 'sizes', current: string) => {
    const options = state.settings.lists[key]
      .filter((o) => !o.hidden || o.name === current)
      .map((o) => ({ value: o.name, label: t(o.name) }));
    if (current && !options.some((o) => o.value === current))
      options.push({ value: current, label: current });
    return options;
  };
  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setErrors({});
    try {
      if (
        Object.entries(rawNumbers).some(
          ([, v]) => v && state.settings.language === 'en' && v.includes(','),
        )
      )
        throw new Error('Use a decimal point in English');
      const parsed = bottleSchema.parse(bottle);
      await mutate({ type: 'saveBottle', bottle: parsed }, t('Bottle saved'));
      navigate(`/bottles/${parsed.id}`);
    } catch (err) {
      const info = errorDetails(err);
      setErrors(info.fields);
      setMessage(info.message);
    }
  }
  const cellar = state.cellars.find((c) => c.id === bottle.cellarId);
  const advice = serving(bottle);
  const count = cellar
    ? occupancy(state, cellar.id) -
      (existing?.cellarId === cellar.id && !duplicate ? existing.quantity : 0) +
      (bottle.quantity || 0)
    : 0;
  return (
    <>
      <h1>
        {t(
          duplicate
            ? 'Duplicate bottle'
            : existing
              ? 'Edit bottle'
              : 'Add Bottle',
        )}
      </h1>
      <p className="muted">
        {t(
          'Fields marked required must be completed. Optional values may be left empty.',
        )}
      </p>
      {!state.cellars.length && (
        <p role="alert">
          {t('Create a cellar before adding a bottle.')}{' '}
          <button onClick={() => navigate('/cellars/new')}>
            {t('Add cellar')}
          </button>
        </p>
      )}
      <form noValidate onSubmit={save}>
        <ErrorSummary message={message} fields={errors} />
        <div className="bottle-form">
          <Photos
            bottle={bottle}
            change={(photos) => update('photos', photos)}
          />
          <div className="form-stack">
            <section className="card">
              <h2>{t('Identity')}</h2>
              <div className="form-grid">
                {field('name', 'Wine name', 'text', true)}
                {field('producer', 'Producer / winery')}
                {select(
                  'type',
                  'Wine type',
                  listOptions('types', bottle.type),
                  true,
                )}
                {field(
                  'vintage',
                  'Vintage',
                  'text',
                  false,
                  'NV means non-vintage; years start at 1800.',
                )}
                {field('country', 'Country')}
                {field('region', 'Region')}
                {field(
                  'appellation',
                  'Appellation',
                  'text',
                  false,
                  'DOCG is an Italian controlled and guaranteed designation of origin.',
                )}
                {field(
                  'grapes',
                  'Grape varieties',
                  'list',
                  false,
                  'Separate multiple values with commas.',
                )}
              </div>
            </section>
            <section className="card">
              <h2>{t('Characteristics')}</h2>
              <div className="form-grid">
                {field(
                  'abv',
                  'Alcohol (ABV %)',
                  'number',
                  false,
                  'ABV is alcohol by volume. Range 0–25, one decimal.',
                )}
                {select(
                  'size',
                  'Bottle size',
                  listOptions('sizes', bottle.size),
                )}
                {select(
                  'sweetness',
                  'Sweetness / style',
                  [
                    'Brut nature',
                    'Extra brut',
                    'Brut',
                    'Dry',
                    'Off-dry',
                    'Sweet',
                  ].map((v) => ({ value: v, label: t(v) })),
                )}
                {field('quantity', 'Quantity', 'number', true)}
                {field('barcode', 'Barcode')}
              </div>
            </section>
            <section className="card">
              <h2>{t('Drinking and notes')}</h2>
              <div className="form-grid">
                {field('drinkFrom', 'Drink from (year)', 'number')}
                {field('drinkBy', 'Drink by (year)', 'number')}
                {field('servingMin', 'Serving minimum (°C)', 'number')}
                {field('servingMax', 'Serving maximum (°C)', 'number')}
                {select(
                  'rating',
                  'Rating',
                  [1, 2, 3, 4, 5].map((n) => ({
                    value: String(n),
                    label: `${n} / 5`,
                  })),
                )}
                {field('tags', 'Tags', 'list')}
              </div>
              <p className="muted">
                {t(advice.glass)} · {t(advice.decant)}
              </p>
              {field('notes', 'Tasting notes', 'textarea')}
            </section>
          </div>
          <div className="form-stack">
            <section className="card">
              <h2>{t('Storage')}</h2>
              {select(
                'cellarId',
                'Cellar',
                state.cellars.map((c) => ({ value: c.id, label: c.name })),
                true,
              )}
              {field(
                'position',
                'Shelf / position',
                'text',
                false,
                'Use shelf/position, for example 2/3, or a free-text location.',
              )}
              {field('datePlaced', 'Date placed in cellar', 'date', true)}
              {cellar && (
                <div className="notice">
                  <p>
                    {cellar.name}:{' '}
                    {temperature(cellar.temperature, state.settings.unit)} ·{' '}
                    {count}/{cellar.capacity ?? '∞'} {t('bottles')}
                  </p>
                  {cellar.capacity !== undefined &&
                    count >= cellar.capacity && (
                      <p>
                        {t(
                          'Warning: cellar capacity reached. You may continue or choose another cellar.',
                        )}
                      </p>
                    )}
                  {(cellar.temperature < advice.min ||
                    cellar.temperature > advice.max) && (
                    <p>
                      {t(
                        'Warning: cellar temperature is outside the suggested range for this wine type.',
                      )}
                    </p>
                  )}
                </div>
              )}
            </section>
            <section className="card">
              <h2>{t('Origin')}</h2>
              {select(
                'origin',
                'Origin',
                listOptions('origins', bottle.origin),
                true,
              )}
              {bottle.origin === 'Gift' && (
                <>
                  {field('giftedBy', 'Gifted by')}
                  {field('occasion', 'Occasion')}
                </>
              )}
              {['Wine shop', 'Grocery'].includes(bottle.origin) &&
                field('shopName', 'Shop name')}
              {['Trip', 'Winery visit'].includes(bottle.origin) &&
                field('trip', 'Place / trip')}
              {field('originDetails', 'Origin details')}
              {bottle.origin !== 'Gift' ? (
                field('price', 'Purchase price', 'number')
              ) : (
                <details open={bottle.price !== undefined}>
                  <summary>{t('Optional price for a gift')}</summary>
                  {field('price', 'Purchase price', 'number')}
                </details>
              )}
              {field('value', 'Estimated value', 'number')}
            </section>
          </div>
        </div>
        <datalist id="country-suggestions">
          {[
            'Italy',
            'France',
            'Spain',
            'Portugal',
            'Germany',
            'United States',
            'Australia',
            'New Zealand',
            'Argentina',
            'Chile',
            'South Africa',
          ].map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <datalist id="region-suggestions">
          {[
            'Lombardy',
            'Piedmont',
            'Tuscany',
            'Sicily',
            'Veneto',
            'Trentino',
            'Champagne',
            'Bordeaux',
            'Burgundy',
            'Loire',
            'Douro',
            'Rioja',
            'Napa Valley',
          ].map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <div className="actions">
          <button className="primary" disabled={busy}>
            {t(message ? 'Retry' : 'Save')}
          </button>
          <button
            type="button"
            onClick={() =>
              navigate(
                existing && !duplicate ? `/bottles/${existing.id}` : '/bottles',
              )
            }
          >
            {t('Cancel')}
          </button>
        </div>
      </form>
    </>
  );
}
export function CellarForm() {
  const { id } = useParams();
  const { state, t, mutate, busy } = useApp();
  const navigate = useNavigate();
  const existing = state.cellars.find((c) => c.id === id);
  const [cellar, setCellar] = useState<Cellar>(() =>
    existing
      ? structuredClone(existing)
      : {
          id: crypto.randomUUID(),
          name: '',
          description: '',
          location: '',
          kind: 'Room',
          temperature: 12,
          shelves: 6,
          positions: 10,
          recommendedTypes: [],
          notes: '',
          readings: [],
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [raw, setRaw] = useState<Record<string, string>>({});
  const numeric = [
    'temperature',
    'humidity',
    'capacity',
    'shelves',
    'positions',
  ];
  const field = (key: keyof Cellar, label: string, required = false) => {
    let value =
      raw[key] ?? (cellar[key] === undefined ? '' : String(cellar[key]));
    if (
      key === 'temperature' &&
      raw[key] === undefined &&
      state.settings.unit === 'F'
    )
      value = String(Number((cellar.temperature * 1.8 + 32).toFixed(1)));
    return (
      <Field
        name={key}
        label={label}
        key={key}
        error={errors[key]}
        required={required}
      >
        <input
          id={key}
          value={value}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `${key}-error` : undefined}
          required={required}
          inputMode={numeric.includes(key) ? 'decimal' : undefined}
          onChange={(e) => {
            const val = e.target.value;
            setRaw((r) => ({ ...r, [key]: val }));
            const n = Number(
              state.settings.language === 'it' ? val.replace(',', '.') : val,
            );
            setCellar((c) => ({
              ...c,
              [key]: numeric.includes(key)
                ? val === ''
                  ? undefined
                  : key === 'temperature' && state.settings.unit === 'F'
                    ? Number(((n - 32) / 1.8).toFixed(6))
                    : n
                : val,
            }));
            setErrors((e) => {
              const copy = { ...e };
              delete copy[key];
              return copy;
            });
          }}
        />
      </Field>
    );
  };
  return (
    <>
      <h1>{t(existing ? 'Edit cellar' : 'Add cellar')}</h1>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setMessage('');
          try {
            const parsed = cellarSchema.parse(cellar);
            await mutate(
              { type: 'saveCellar', cellar: parsed },
              t('Cellar saved'),
            );
            navigate(`/cellars/${parsed.id}`);
          } catch (err) {
            const info = errorDetails(err);
            setErrors(info.fields);
            setMessage(info.message);
          }
        }}
      >
        <ErrorSummary message={message} fields={errors} />
        <div className="two-columns">
          <section className="card">
            <div className="form-grid">
              {field('name', 'Name', true)}
              {field('description', 'Description')}
              {field('location', 'Location')}
              {field('kind', 'Cellar kind')}
              {field(
                'temperature',
                `Target temperature (°${state.settings.unit})`,
                true,
              )}
              {field('humidity', 'Target humidity (%)')}
              {field('capacity', 'Capacity (bottles)')}
              {field('shelves', 'Number of shelves')}
              {field('positions', 'Positions per shelf')}
              {field('notes', 'Notes')}
            </div>
            <p className="muted">
              {t(
                'Temperature: 0–25 °C, steps of 0.5 (32–77 °F, steps of 0.9).',
              )}
            </p>
            <fieldset>
              <legend>{t('Recommended wine types')}</legend>
              <div className="checks">
                {state.settings.lists.types.map((type) => (
                  <label key={type.name}>
                    <input
                      type="checkbox"
                      checked={cellar.recommendedTypes.includes(type.name)}
                      onChange={(e) =>
                        setCellar((c) => ({
                          ...c,
                          recommendedTypes: e.target.checked
                            ? [...c.recommendedTypes, type.name]
                            : c.recommendedTypes.filter((v) => v !== type.name),
                        }))
                      }
                    />
                    {t(type.name)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="actions">
              <button className="primary" disabled={busy}>
                {t(message ? 'Retry' : 'Save')}
              </button>
              <button type="button" onClick={() => navigate('/cellars')}>
                {t('Cancel')}
              </button>
            </div>
          </section>
          <Rack
            cellar={{
              ...cellar,
              shelves: Math.min(50, Math.max(1, cellar.shelves || 1)),
              positions: Math.min(50, Math.max(1, cellar.positions || 1)),
            }}
          />
        </div>
      </form>
    </>
  );
}
export function OpenDialog({
  bottle,
  close,
}: {
  bottle: Bottle;
  close: () => void;
}) {
  const { t, mutate, busy } = useApp();
  const [quantity, setQuantity] = useState('1');
  const [date, setDate] = useState(today());
  const [occasion, setOccasion] = useState('');
  const [people, setPeople] = useState('');
  const [rating, setRating] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  return (
    <Modal title={t('Mark as opened')} onClose={close}>
      <p>
        {bottle.name} · {t('In stock')}: {bottle.quantity}
      </p>
      {bottle.giftedBy && (
        <p>
          {t('Gifted by')}: {bottle.giftedBy} ·{' '}
          {t('Consider a thank-you note.')}
        </p>
      )}
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await mutate(
              {
                type: 'open',
                id: bottle.id,
                quantity: +quantity,
                date,
                occasion,
                people,
                rating: rating ? +rating : undefined,
                notes,
              },
              t('Opening recorded'),
              { type: 'undoOpen', id: bottle.id },
            );
            close();
          } catch (err) {
            const info = errorDetails(err);
            setError(info.message);
            setFields(info.fields);
          }
        }}
      >
        <ErrorSummary message={error} fields={fields} />
        <div className="form-grid">
          {[
            ['quantity', 'Quantity', quantity, setQuantity],
            ['date', 'Date', date, setDate],
            ['occasion', 'Occasion', occasion, setOccasion],
            ['people', 'People', people, setPeople],
          ].map(([key, label, value, setter]) => (
            <Field
              key={String(key)}
              name={String(key)}
              label={String(label)}
              error={fields[String(key)]}
              required={['quantity', 'date'].includes(String(key))}
            >
              <input
                id={String(key)}
                type={key === 'date' ? 'date' : 'text'}
                inputMode={key === 'quantity' ? 'numeric' : undefined}
                value={String(value)}
                aria-invalid={!!fields[String(key)]}
                aria-describedby={
                  fields[String(key)] ? `${String(key)}-error` : undefined
                }
                onChange={(e) =>
                  (setter as (v: string) => void)(e.target.value)
                }
              />
            </Field>
          ))}
          <Field name="opening-rating" label="Rating">
            <select
              id="opening-rating"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
            >
              <option value="">{t('Unrated')}</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field name="opening-notes" label="Tasting notes">
          <textarea
            id="opening-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <div className="actions">
          <button className="primary" disabled={busy}>
            {t('Mark as opened')}
          </button>
          <button type="button" onClick={close}>
            {t('Cancel')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
