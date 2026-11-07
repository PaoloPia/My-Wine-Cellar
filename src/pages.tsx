import { useState } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useApp } from './context';
import {
  BottleCard,
  BottleImage,
  Confirm,
  DateText,
  Field,
  Modal,
  MoveDialog,
  Quantity,
  Rack,
  Status,
  Temperature,
  errorDetails,
} from './components';
import { OpenDialog } from './forms';
import {
  alerts,
  drinkingStatus,
  filtersMatch,
  occupancy,
  summary,
  type Bottle,
} from '../shared/model';
import { pairingsFor, reversePairing, serving } from '../shared/pairings';
import { exportCsv } from '../shared/csv';
import { download, exportPdf } from './reports';

export function Dashboard() {
  const { state, t, money, mutate, notify } = useApp();
  const totals = summary(state);
  const recent = [...state.bottles]
    .filter((b) => b.quantity > 0)
    .sort((a, b) => b.datePlaced.localeCompare(a.datePlaced))
    .slice(0, 4);
  const notices = alerts(state);
  const suggestion = state.bottles.find(
    (b) => b.quantity > 0 && drinkingStatus(b) === 'Ready',
  );
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">{t('A collection worth savouring')}</p>
          <h1>
            {t('Welcome to')}
            <br />
            My Wine Cellar
          </h1>
          <p>{t('Your collection at a glance')}</p>
          <Link className="button primary" to="/bottles/new">
            {t('Add Bottle')}
          </Link>
        </div>
        <img src="/assets/hero.webp" alt="" aria-hidden="true" />
      </section>
      <div className="kpis">
        {[
          ['Total bottles', totals.total],
          ['Distinct wines', totals.distinct],
          ['Cellars', totals.cellars],
          ['Ready to drink', totals.ready],
          ['Drink soon', totals.soon],
          ['Estimated value', money(totals.value)],
        ].map(([label, value]) => (
          <section className="card kpi" key={label}>
            <h2>{t(String(label))}</h2>
            <strong>{value}</strong>
          </section>
        ))}
      </div>
      {!state.settings.noticeDismissed && (
        <div className="notice">
          <p>
            {t(
              'Your collection is stored in local JSON files and cached in this browser for offline use. Clearing browser data removes the offline copy and unsynced changes, not the server files. Export backups regularly.',
            )}
          </p>
          <button
            onClick={() =>
              mutate({
                type: 'settings',
                settings: { ...state.settings, noticeDismissed: true },
              }).catch((e) => notify(errorDetails(e).message))
            }
          >
            {t('Dismiss notice')}
          </button>
        </div>
      )}
      <div className="dashboard-columns">
        <section>
          <div className="heading-row">
            <h2>{t('Recently added')}</h2>
            <Link className="button" to="/bottles">
              {t('View all')} →
            </Link>
          </div>
          <div className="cards">
            {recent.map((b) => (
              <BottleCard key={b.id} bottle={b} />
            ))}
          </div>
          {!recent.length && (
            <div className="empty card">
              <h3>{t('Your first bottle awaits')}</h3>
              <p>{t('Create a cellar, then add your wines.')}</p>
              <Link to="/cellars/new">{t('Add cellar')}</Link>
            </div>
          )}
        </section>
        <section className="card">
          <h2>{t('Cellar temperatures')}</h2>
          {state.cellars.map((c) => (
            <div className="cellar-summary" key={c.id}>
              <h3>
                <Link to={`/cellars/${c.id}`}>{c.name}</Link>
              </h3>
              <strong>
                <Temperature value={c.temperature} />
              </strong>
              <p>
                {occupancy(state, c.id)} / {c.capacity ?? '∞'} {t('bottles')}{' '}
                {c.capacity &&
                  `(${Math.round((occupancy(state, c.id) / c.capacity) * 100)}%)`}
              </p>
            </div>
          ))}
          <Link to="/cellars/new">{t('Add cellar')}</Link>
        </section>
      </div>
      <div className="two-columns">
        <section className="card">
          <h2>{t('Notifications')}</h2>
          {!notices.length && (
            <p>{t('No alerts. Your collection is looking good.')}</p>
          )}
          <ul className="alert-list">
            {notices.slice(0, 10).map((alert) => (
              <li key={alert.id}>
                <span>
                  {alert.bottleId ? (
                    <Link to={`/bottles/${alert.bottleId}`}>{alert.text}</Link>
                  ) : (
                    alert.text
                  )}
                </span>
                <button
                  aria-label={`${t('Dismiss alert')}: ${alert.text}`}
                  onClick={() =>
                    mutate({
                      type: 'settings',
                      settings: {
                        ...state.settings,
                        dismissedAlerts: [
                          ...state.settings.dismissedAlerts,
                          alert.id,
                        ],
                      },
                    }).catch((e) => notify(errorDetails(e).message))
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>{t('Suggestion of the day')}</h2>
          {suggestion ? (
            <>
              <h3>
                <Link to={`/bottles/${suggestion.id}`}>
                  {suggestion.name} {suggestion.vintage}
                </Link>
              </h3>
              <p>{pairingsFor(suggestion)[0].dish}</p>
              <Status bottle={suggestion} />
            </>
          ) : (
            <p>{t('Add a wine that is ready to drink for a suggestion.')}</p>
          )}
          <div className="actions">
            <Link className="button" to="/pairing">
              {t('Find a pairing')}
            </Link>
            <Link className="button" to="/journal">
              {t('Tasting journal')}
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
export function Inventory() {
  const { state, t, mutate, notify, busy } = useApp();
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(params.entries());
  const [view, setView] = useState(
    () => localStorage.getItem('wine-view') ?? 'grid',
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<
    'delete' | 'move' | 'tag' | 'saveView'
  >();
  const [tag, setTag] = useState('');
  const [viewName, setViewName] = useState('');
  const archive = params.get('archive') === '1';
  const sort = params.get('sort') ?? 'name';
  const desc = params.get('direction') === 'desc';
  const page = +(params.get('page') ?? 1);
  const update = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete('page');
    setParams(p);
  };
  const wines = state.bottles
    .filter(
      (b) =>
        (archive ? b.quantity === 0 : b.quantity > 0) &&
        filtersMatch(b, filters),
    )
    .sort((a, b) => {
      const av = a[sort as keyof Bottle];
      const bv = b[sort as keyof Bottle];
      const cmp =
        typeof av === 'number' || typeof bv === 'number'
          ? (typeof av === 'number' ? av : -Infinity) -
            (typeof bv === 'number' ? bv : -Infinity)
          : String(av ?? '').localeCompare(String(bv ?? ''), undefined, {
              numeric: true,
            });
      return desc ? -cmp : cmp;
    });
  const effectivePage = Math.min(
    Math.max(1, page),
    Math.max(1, Math.ceil(wines.length / 50)),
  );
  const shown = wines.slice((effectivePage - 1) * 50, effectivePage * 50);
  const chosen = state.bottles.filter((b) => selected.includes(b.id));
  const filterKeys = [
    'query',
    'type',
    'cellarId',
    'origin',
    'country',
    'region',
    'vintageMin',
    'vintageMax',
    'abvMin',
    'abvMax',
    'status',
    'ratingMin',
    'priceMin',
    'priceMax',
  ];
  return (
    <>
      <div className="heading-row">
        <h1>{t(archive ? 'Archive' : 'My Bottles')}</h1>
        <Link className="button primary" to="/bottles/new">
          {t('Add Bottle')}
        </Link>
      </div>
      <div className="toolbar">
        <button aria-pressed={!archive} onClick={() => update('archive', '')}>
          {t('Inventory')}
        </button>
        <button aria-pressed={archive} onClick={() => update('archive', '1')}>
          {t('Archive')}
        </button>
        <button
          aria-pressed={view === 'grid'}
          onClick={() => {
            setView('grid');
            localStorage.setItem('wine-view', 'grid');
          }}
        >
          {t('Grid view')}
        </button>
        <button
          aria-pressed={view === 'list'}
          onClick={() => {
            setView('list');
            localStorage.setItem('wine-view', 'list');
          }}
        >
          {t('List view')}
        </button>
      </div>
      <section className="card filters">
        <Field name="inventory-search" label="Search your wines">
          <input
            id="inventory-search"
            type="search"
            value={params.get('query') ?? ''}
            onChange={(e) => update('query', e.target.value)}
          />
        </Field>
        <details open={filterKeys.some((k) => k !== 'query' && filters[k])}>
          <summary>{t('Filters')}</summary>
          <div className="form-grid">
            {[
              [
                'type',
                'Wine type',
                state.settings.lists.types.map((v) => [v.name, t(v.name)]),
              ],
              ['cellarId', 'Cellar', state.cellars.map((c) => [c.id, c.name])],
              [
                'origin',
                'Origin',
                state.settings.lists.origins.map((v) => [v.name, t(v.name)]),
              ],
              [
                'status',
                'Drinking status',
                ['Too young', 'Ready', 'Drink soon', 'Past peak'].map((s) => [
                  s,
                  t(s),
                ]),
              ],
            ].map(([key, label, options]) => (
              <Field
                key={String(key)}
                name={`filter-${key}`}
                label={String(label)}
              >
                <select
                  id={`filter-${key}`}
                  value={filters[String(key)] ?? ''}
                  onChange={(e) => update(String(key), e.target.value)}
                >
                  <option value="">{t('All')}</option>
                  {(options as string[][]).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            {[
              ['country', 'Country'],
              ['region', 'Region'],
              ['vintageMin', 'Vintage minimum'],
              ['vintageMax', 'Vintage maximum'],
              ['abvMin', 'ABV minimum'],
              ['abvMax', 'ABV maximum'],
              ['ratingMin', 'Minimum rating'],
              ['priceMin', 'Minimum price'],
              ['priceMax', 'Maximum price'],
            ].map(([key, label]) => (
              <Field key={key} name={`filter-${key}`} label={label}>
                <input
                  id={`filter-${key}`}
                  type={
                    key === 'country' || key === 'region' ? 'text' : 'number'
                  }
                  step="any"
                  value={filters[key] ?? ''}
                  onChange={(e) => update(key, e.target.value)}
                />
              </Field>
            ))}
          </div>
        </details>
        <div className="chips">
          {filterKeys
            .filter((k) => filters[k])
            .map((key) => (
              <button
                key={key}
                onClick={() => update(key, '')}
                aria-label={`${t('Remove filter')}: ${t(key)} ${filters[key]}`}
              >
                {t(key)}: {filters[key]} ×
              </button>
            ))}
          {filterKeys.some((k) => filters[k]) && (
            <button onClick={() => setParams(archive ? { archive: '1' } : {})}>
              {t('Clear all')}
            </button>
          )}
        </div>
        <div className="toolbar">
          <Field name="sort" label="Sort by">
            <select
              id="sort"
              value={sort}
              onChange={(e) => update('sort', e.target.value)}
            >
              {[
                ['name', 'Name'],
                ['vintage', 'Vintage'],
                ['datePlaced', 'Date placed in cellar'],
                ['drinkBy', 'Drink by (year)'],
                ['rating', 'Rating'],
                ['price', 'Purchase price'],
                ['quantity', 'Quantity'],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </Field>
          <button onClick={() => update('direction', desc ? '' : 'desc')}>
            {t(desc ? 'Descending' : 'Ascending')}
          </button>
          <button onClick={() => setDialog('saveView')}>
            {t('Save view')}
          </button>
          {state.settings.savedViews.map((v, i) => (
            <button key={i} onClick={() => setParams(v.filters)}>
              {v.name}
            </button>
          ))}
        </div>
      </section>
      <div className="toolbar">
        <p role="status" aria-live="polite">
          {wines.length} {t('wines found')} · {chosen.length} {t('selected')}
        </p>
        <button onClick={() => setSelected(shown.map((b) => b.id))}>
          {t('Select page')}
        </button>
        <button onClick={() => setSelected([])}>{t('Clear selection')}</button>
        <button disabled={!chosen.length} onClick={() => setDialog('move')}>
          {t('Move')}
        </button>
        <button disabled={!chosen.length} onClick={() => setDialog('tag')}>
          {t('Add tag')}
        </button>
        <button
          disabled={!chosen.length}
          onClick={() =>
            download(exportCsv(chosen, state), 'selected-wines.csv', 'text/csv')
          }
        >
          {t('Export selected')}
        </button>
        <button disabled={!chosen.length} onClick={() => setDialog('delete')}>
          {t('Delete')}
        </button>
      </div>
      {view === 'grid' ? (
        <div className="inventory-cards">
          {shown.map((b) => (
            <BottleCard
              key={b.id}
              bottle={b}
              selected={selected.includes(b.id)}
              select={() =>
                setSelected((s) =>
                  s.includes(b.id) ? s.filter((v) => v !== b.id) : [...s, b.id],
                )
              }
            />
          ))}
        </div>
      ) : (
        <div className="table-scroll card">
          <table>
            <caption>{t('Wine inventory')}</caption>
            <thead>
              <tr>
                {[
                  'Select',
                  'Photo',
                  'Wine',
                  'Wine type',
                  'Vintage',
                  'ABV',
                  'Cellar',
                  'Quantity',
                  'Drinking status',
                ].map((h) => (
                  <th key={h} scope="col">
                    {t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${t('Select')}: ${b.name}`}
                      checked={selected.includes(b.id)}
                      onChange={() =>
                        setSelected((s) =>
                          s.includes(b.id)
                            ? s.filter((id) => id !== b.id)
                            : [...s, b.id],
                        )
                      }
                    />
                  </td>
                  <td>
                    <BottleImage bottle={b} />
                  </td>
                  <td>
                    <Link to={`/bottles/${b.id}`}>{b.name}</Link>
                  </td>
                  <td>{t(b.type)}</td>
                  <td>{b.vintage}</td>
                  <td>{b.abv ?? '—'}</td>
                  <td>
                    {state.cellars.find((c) => c.id === b.cellarId)?.name}
                  </td>
                  <td>
                    <Quantity bottle={b} />
                  </td>
                  <td>
                    <Status bottle={b} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!shown.length && (
        <p className="empty card">{t('No wines match these filters.')}</p>
      )}
      {wines.length > 50 && (
        <nav className="pagination" aria-label={t('Inventory pagination')}>
          <button
            disabled={effectivePage <= 1}
            onClick={() => {
              const p = new URLSearchParams(params);
              p.set('page', String(effectivePage - 1));
              setParams(p);
            }}
          >
            {t('Previous')}
          </button>
          <span role="status">
            {t('Page')} {effectivePage} / {Math.ceil(wines.length / 50)}
          </span>
          <button
            disabled={effectivePage * 50 >= wines.length}
            onClick={() => {
              const p = new URLSearchParams(params);
              p.set('page', String(effectivePage + 1));
              setParams(p);
            }}
          >
            {t('Next')}
          </button>
        </nav>
      )}
      {dialog === 'move' && (
        <MoveDialog bottles={chosen} onClose={() => setDialog(undefined)} />
      )}
      {dialog === 'delete' && (
        <Confirm
          title={t('Delete selected bottles?')}
          message={t(
            'All selected wine entries and their history will be removed. You can undo this deletion from the message.',
          )}
          close={() => setDialog(undefined)}
          confirm={async () => {
            await mutate(
              { type: 'deleteBottles', ids: chosen.map((b) => b.id) },
              t('Bottles deleted'),
              { type: 'restoreBottles', bottles: structuredClone(chosen) },
            );
            setSelected([]);
          }}
        />
      )}
      {dialog === 'tag' && (
        <Modal title={t('Add tag')} onClose={() => setDialog(undefined)}>
          <Field name="bulk-tag" label="Tag">
            <input
              id="bulk-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
          </Field>
          <div className="actions">
            <button
              disabled={busy || !tag.trim()}
              className="primary"
              onClick={() =>
                mutate({ type: 'tag', ids: selected, tag }, t('Tag added'))
                  .then(() => setDialog(undefined))
                  .catch((e) => notify(errorDetails(e).message))
              }
            >
              {t('Save')}
            </button>
            <button onClick={() => setDialog(undefined)}>{t('Cancel')}</button>
          </div>
        </Modal>
      )}
      {dialog === 'saveView' && (
        <Modal title={t('Save view')} onClose={() => setDialog(undefined)}>
          <Field name="view-name" label="View name">
            <input
              id="view-name"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
            />
          </Field>
          <button
            disabled={busy || !viewName.trim()}
            onClick={() =>
              mutate(
                {
                  type: 'settings',
                  settings: {
                    ...state.settings,
                    savedViews: [
                      ...state.settings.savedViews,
                      { name: viewName, filters },
                    ],
                  },
                },
                t('View saved'),
              )
                .then(() => setDialog(undefined))
                .catch((e) => notify(errorDetails(e).message))
            }
          >
            {t('Save')}
          </button>
        </Modal>
      )}
    </>
  );
}
export function PairingCards({ bottle }: { bottle: Bottle }) {
  const { t, mutate, notify, state } = useApp();
  const [personal, setPersonal] = useState('');
  const advice = serving(bottle);
  return (
    <section className="card">
      <h2>{t('Suggested food pairings')}</h2>
      <p>
        {temperatureAdvice(
          bottle.servingMin ?? advice.min,
          bottle.servingMax ?? advice.max,
          state.settings.unit,
        )}{' '}
        · {t(advice.glass)} · {t(advice.decant)}
      </p>
      <div className="pairing-cards">
        {pairingsFor(bottle).map((p) => (
          <article className="pairing" key={p.dish}>
            <h3>{t(p.dish)}</h3>
            <p>{t(p.reason)}</p>
            <div className="row">
              <button
                aria-pressed={bottle.feedback[p.dish] === 'like'}
                aria-label={`${t('Like pairing')}: ${p.dish}`}
                onClick={() =>
                  mutate(
                    {
                      type: 'saveBottle',
                      bottle: {
                        ...bottle,
                        feedback: { ...bottle.feedback, [p.dish]: 'like' },
                      },
                    },
                    t('Pairing preference saved'),
                  ).catch((e) => notify(errorDetails(e).message))
                }
              >
                {t('Like')}
              </button>
              <button
                aria-pressed={bottle.feedback[p.dish] === 'dislike'}
                aria-label={`${t('Dislike pairing')}: ${p.dish}`}
                onClick={() =>
                  mutate(
                    {
                      type: 'saveBottle',
                      bottle: {
                        ...bottle,
                        feedback: { ...bottle.feedback, [p.dish]: 'dislike' },
                      },
                    },
                    t('Pairing preference saved'),
                  ).catch((e) => notify(errorDetails(e).message))
                }
              >
                {t('Not for me')}
              </button>
            </div>
          </article>
        ))}
      </div>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          mutate(
            {
              type: 'saveBottle',
              bottle: {
                ...bottle,
                pairings: [...bottle.pairings, personal.trim()],
              },
            },
            t('Personal pairing saved'),
          )
            .then(() => setPersonal(''))
            .catch((e) => notify(errorDetails(e).message));
        }}
      >
        <Field name={`pairing-${bottle.id}`} label="Personal pairing">
          <input
            id={`pairing-${bottle.id}`}
            value={personal}
            maxLength={2000}
            required
            onChange={(e) => setPersonal(e.target.value)}
          />
        </Field>
        <button disabled={!personal.trim()}>{t('Add pairing')}</button>
      </form>
    </section>
  );
}
function temperatureAdvice(min: number, max: number, unit: 'C' | 'F') {
  return `${unit === 'F' ? Number((min * 1.8 + 32).toFixed(1)) : min}–${unit === 'F' ? Number((max * 1.8 + 32).toFixed(1)) : max} °${unit}`;
}
export function BottleDetail() {
  const { id } = useParams();
  const { state, t, mutate, money, notify } = useApp();
  const navigate = useNavigate();
  const bottle = state.bottles.find((b) => b.id === id);
  const [dialog, setDialog] = useState<'open' | 'move' | 'delete'>();
  if (!bottle)
    return (
      <>
        <h1>{t('Bottle not found')}</h1>
        <Link to="/bottles">{t('My Bottles')}</Link>
      </>
    );
  const c = state.cellars.find((c) => c.id === bottle.cellarId);
  const details: [string, string | number][] = [
    ['Producer / winery', bottle.producer],
    ['Wine type', t(bottle.type)],
    ['Vintage', bottle.vintage],
    ['Country', bottle.country],
    ['Region', bottle.region],
    ['Appellation', bottle.appellation],
    ['Grape varieties', bottle.grapes.join(', ')],
    ['Alcohol (ABV %)', bottle.abv ?? '—'],
    ['Bottle size', bottle.size],
    ['Sweetness / style', bottle.sweetness],
    ['Cellar', c?.name ?? ''],
    ['Shelf / position', bottle.position],
    ['Origin', t(bottle.origin)],
    ['Origin details', bottle.originDetails],
    ['Gifted by', bottle.giftedBy],
    ['Occasion', bottle.occasion],
    ['Shop name', bottle.shopName],
    ['Place / trip', bottle.trip],
    ['Purchase price', bottle.price === undefined ? '—' : money(bottle.price)],
    ['Estimated value', bottle.value === undefined ? '—' : money(bottle.value)],
    ['Tags', bottle.tags.join(', ')],
    ['Barcode', bottle.barcode],
  ];
  return (
    <>
      <div className="heading-row">
        <div>
          <h1>
            {bottle.name} {bottle.vintage}
          </h1>
          <span className="badge">{t(bottle.type)}</span>
        </div>
        <div className="actions">
          <Link className="button" to={`/bottles/${id}/edit`}>
            {t('Edit')}
          </Link>
          <button onClick={() => setDialog('move')}>{t('Move')}</button>
          <button
            className="primary"
            disabled={bottle.quantity === 0}
            onClick={() => setDialog('open')}
          >
            {t('Mark as opened')}
          </button>
        </div>
      </div>
      <div className="detail-grid">
        <div>
          <BottleImage bottle={bottle} large />
          <div className="extra-photos">
            {bottle.photos.slice(1).map((p, i) => (
              <img key={i} src={p.src} alt={p.alt} />
            ))}
          </div>
          <div className="actions">
            <Link className="button" to={`/bottles/${id}/duplicate`}>
              {t('Duplicate')}
            </Link>
            <button className="danger" onClick={() => setDialog('delete')}>
              {t('Delete')}
            </button>
          </div>
        </div>
        <section className="card">
          <h2>{t('Bottle details')}</h2>
          <dl>
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{t(label)}</dt>
                <dd>{value || '—'}</dd>
              </div>
            ))}
            <div>
              <dt>{t('Date placed in cellar')}</dt>
              <dd>
                <DateText value={bottle.datePlaced} />
              </dd>
            </div>
          </dl>
        </section>
        <div className="form-stack">
          <section className="card">
            <h2>{t('Drinking window')}</h2>
            <p>
              {bottle.drinkFrom ?? '—'} → {bottle.drinkBy ?? '—'}
            </p>
            <p className="muted">
              {t(
                'The drinking window is the period when a wine is expected to taste its best.',
              )}
            </p>
            <Status bottle={bottle} />
          </section>
          <section className="card">
            <h2>{t('Quantity')}</h2>
            <Quantity bottle={bottle} />
          </section>
          <section className="card">
            <h2>{t('Rating')}</h2>
            <p aria-label={`${bottle.rating ?? 0} / 5`}>
              {'★'.repeat(bottle.rating ?? 0)}
              {'☆'.repeat(5 - (bottle.rating ?? 0))}
            </p>
          </section>
          <section className="card">
            <h2>{t('Tasting notes')}</h2>
            <p>{bottle.notes || t('No notes yet.')}</p>
          </section>
        </div>
      </div>
      <PairingCards bottle={bottle} />
      <section className="card">
        <div className="heading-row">
          <h2>{t('History')}</h2>
          <button
            disabled={
              bottle.history.at(-1)?.kind !== 'opened' ||
              !!bottle.history.at(-1)?.undone
            }
            onClick={() =>
              mutate(
                { type: 'undoOpen', id: bottle.id },
                t('Last opening undone'),
              ).catch((e) => notify(errorDetails(e).message))
            }
          >
            {t('Undo last opening')}
          </button>
        </div>
        <ol className="history">
          {[...bottle.history].reverse().map((e, i) => (
            <li key={`${e.id}-${i}`}>
              <DateText value={e.date} /> · {t(e.kind)} — {e.description}
              {e.undone && ` (${t('undone')})`}
              {e.kind === 'opened' && (
                <p>
                  {e.occasion} · {e.people} · {e.rating ? `${e.rating}/5` : ''}{' '}
                  {e.notes}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>
      {dialog === 'open' && (
        <OpenDialog bottle={bottle} close={() => setDialog(undefined)} />
      )}
      {dialog === 'move' && (
        <MoveDialog bottles={[bottle]} onClose={() => setDialog(undefined)} />
      )}
      {dialog === 'delete' && (
        <Confirm
          title={t('Delete bottle?')}
          message={`${bottle.name}: ${t('This removes the wine entry, photos and history. Undo is available in the message.')}`}
          close={() => setDialog(undefined)}
          confirm={async () => {
            await mutate(
              { type: 'deleteBottles', ids: [bottle.id] },
              t('Bottle deleted'),
              { type: 'restoreBottles', bottles: [structuredClone(bottle)] },
            );
            navigate('/bottles');
          }}
        />
      )}
    </>
  );
}
export function Cellars() {
  const { state, t, money } = useApp();
  return (
    <>
      <div className="heading-row">
        <h1>{t('Cellars')}</h1>
        <Link className="button primary" to="/cellars/new">
          {t('Add cellar')}
        </Link>
      </div>
      <div className="cellar-cards">
        {state.cellars.map((c) => {
          const count = occupancy(state, c.id);
          return (
            <article className="card" key={c.id}>
              <img
                className="cellar-photo"
                src={`/assets/${c.kind === 'Wine fridge' ? 'fridge' : c.kind === 'Cabinet' ? 'cabinet' : 'cellar'}.webp`}
                alt=""
                aria-hidden="true"
              />
              <h2>
                <Link to={`/cellars/${c.id}`}>{c.name}</Link>
              </h2>
              <p>{c.description || c.location}</p>
              <strong className="temperature">
                <Temperature value={c.temperature} />
              </strong>
              <p>
                {count} / {c.capacity ?? '∞'} {t('bottles')}
                {c.capacity && ` (${Math.round((count / c.capacity) * 100)}%)`}
              </p>
              {c.capacity && (
                <progress
                  max={c.capacity}
                  value={Math.min(count, c.capacity)}
                  aria-label={`${c.name}: ${t('Occupancy')}`}
                />
              )}
              <p>
                {t('Estimated value')}:{' '}
                {money(
                  state.bottles
                    .filter((b) => b.cellarId === c.id)
                    .reduce(
                      (n, b) => n + b.quantity * (b.value ?? b.price ?? 0),
                      0,
                    ),
                )}
              </p>
              <Link className="button" to={`/cellars/${c.id}`}>
                {t('View cellar')}
              </Link>
            </article>
          );
        })}
      </div>
      {!state.cellars.length && (
        <div className="card empty">
          <h2>{t('A home for your wines')}</h2>
          <p>{t('Add your first cellar to begin.')}</p>
        </div>
      )}
    </>
  );
}
export function CellarDetail() {
  const { id } = useParams();
  const { state, t, mutate, notify } = useApp();
  const navigate = useNavigate();
  const cellar = state.cellars.find((c) => c.id === id);
  const [remove, setRemove] = useState(false);
  const [destination, setDestination] = useState('');
  const [deleteContents, setDeleteContents] = useState(false);
  const [readingTemp, setReadingTemp] = useState('');
  const [readingHumidity, setReadingHumidity] = useState('');
  if (!cellar)
    return (
      <>
        <h1>{t('Cellar not found')}</h1>
        <Link to="/cellars">{t('Cellars')}</Link>
      </>
    );
  const bottles = state.bottles.filter((b) => b.cellarId === id);
  const count = occupancy(state, cellar.id);
  return (
    <>
      <div className="heading-row">
        <h1>{cellar.name}</h1>
        <div className="actions">
          <Link className="button" to={`/cellars/${id}/edit`}>
            {t('Edit')}
          </Link>
          <button className="danger" onClick={() => setRemove(true)}>
            {t('Delete cellar')}
          </button>
        </div>
      </div>
      <div className="two-columns">
        <section className="card">
          <h2>{t('Cellar details')}</h2>
          <dl>
            {[
              ['Description', cellar.description],
              ['Location', cellar.location],
              ['Cellar kind', cellar.kind],
              ['Target humidity (%)', cellar.humidity ?? '—'],
              ['Capacity (bottles)', cellar.capacity ?? '∞'],
              [
                'Occupancy',
                `${count}${cellar.capacity ? ` (${Math.round((count / cellar.capacity) * 100)}%)` : ''}`,
              ],
              ['Recommended wine types', cellar.recommendedTypes.join(', ')],
              ['Notes', cellar.notes],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{t(String(label))}</dt>
                <dd>{value || '—'}</dd>
              </div>
            ))}
          </dl>
          <p className="temperature">
            <Temperature value={cellar.temperature} />
          </p>
          <Link to={`/bottles?cellarId=${id}`}>
            {t('View bottles in this cellar')}
          </Link>
          <h3>{t('Manual readings')}</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(readingTemp.replace(',', '.'));
              const temperature =
                state.settings.unit === 'F' ? (n - 32) / 1.8 : n;
              mutate(
                {
                  type: 'saveCellar',
                  cellar: {
                    ...cellar,
                    readings: [
                      ...cellar.readings,
                      {
                        date: new Date().toISOString(),
                        temperature,
                        humidity: readingHumidity
                          ? Number(readingHumidity)
                          : undefined,
                      },
                    ],
                  },
                },
                t('Reading saved'),
              )
                .then(() => {
                  setReadingTemp('');
                  setReadingHumidity('');
                })
                .catch((e) => notify(errorDetails(e).message));
            }}
          >
            <Field
              name="reading-temperature"
              label={`Temperature (°${state.settings.unit})`}
              required
            >
              <input
                id="reading-temperature"
                value={readingTemp}
                required
                onChange={(e) => setReadingTemp(e.target.value)}
              />
            </Field>
            <Field name="reading-humidity" label="Humidity (%)">
              <input
                id="reading-humidity"
                value={readingHumidity}
                onChange={(e) => setReadingHumidity(e.target.value)}
              />
            </Field>
            <button>{t('Save reading')}</button>
          </form>
          <ul>
            {[...cellar.readings].reverse().map((r, i) => (
              <li key={i}>
                <DateText value={r.date} /> ·{' '}
                <Temperature value={r.temperature} /> · {r.humidity ?? '—'}%
              </li>
            ))}
          </ul>
        </section>
        <Rack cellar={cellar} />
      </div>
      {remove && (
        <Confirm
          title={t('Delete cellar?')}
          message={
            bottles.length
              ? t(
                  'This cellar contains bottles, including archived entries. Move them to another cellar or explicitly delete its contents.',
                )
              : t('Delete this empty cellar?')
          }
          close={() => setRemove(false)}
          confirm={async () => {
            await mutate(
              {
                type: 'deleteCellar',
                id: cellar.id,
                moveTo: destination || undefined,
                deleteContents,
              },
              t('Cellar deleted'),
              {
                type: 'undoCellarDeletion',
                cellar: structuredClone(cellar),
                bottles: structuredClone(bottles),
                moved: !!destination,
              },
            );
            navigate('/cellars');
          }}
        >
          <Field name="delete-move-to" label="Move contents to">
            <select
              id="delete-move-to"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                setDeleteContents(false);
              }}
            >
              <option value="">{t('Choose…')}</option>
              {state.cellars
                .filter((c) => c.id !== id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          {!!bottles.length && (
            <label className="check">
              <input
                type="checkbox"
                checked={deleteContents}
                onChange={(e) => {
                  setDeleteContents(e.target.checked);
                  setDestination('');
                }}
              />
              {t('Delete all bottles in this cellar (including history)')}
            </label>
          )}
        </Confirm>
      )}
    </>
  );
}
export function FoodPairing() {
  const { state, t } = useApp();
  const [params, setParams] = useSearchParams();
  const query = params.get('dish') ?? '';
  const results = reversePairing(state.bottles, query);
  return (
    <>
      <h1>{t('Food Pairing')}</h1>
      <section className="pairing-hero card">
        <h2>{t('What are you eating tonight?')}</h2>
        <p>
          {t(
            'Find the perfect bottle from your own collection. Pairing rules work offline.',
          )}
        </p>
        <Field name="dish" label="Dish or ingredient">
          <input
            id="dish"
            type="search"
            placeholder={t('Try mushroom risotto, oysters or braised beef')}
            value={query}
            onChange={(e) =>
              setParams(e.target.value ? { dish: e.target.value } : {})
            }
          />
        </Field>
        <div className="chips">
          {[
            'Mushroom risotto',
            'Oysters',
            'Pizza',
            'Braised beef',
            'Dark chocolate',
          ].map((dish) => (
            <button key={dish} onClick={() => setParams({ dish })}>
              {t(dish)}
            </button>
          ))}
        </div>
      </section>
      <p role="status">
        {results.length}{' '}
        {t('matching wines; Ready and Drink soon are prioritised.')}
      </p>
      <div className="inventory-cards">
        {results.map((r) => (
          <BottleCard key={r.bottle.id} bottle={r.bottle} />
        ))}
      </div>
      {query && !results.length && (
        <p className="card">
          {t('No matching bottles. Try another ingredient or add more wines.')}
        </p>
      )}
    </>
  );
}
export function Journal() {
  const { state, t } = useApp();
  const entries = state.bottles
    .flatMap((b) =>
      b.history.filter((e) => e.kind === 'opened').map((e) => ({ b, e })),
    )
    .sort((a, b) => b.e.date.localeCompare(a.e.date));
  return (
    <>
      <h1>{t('Tasting journal')}</h1>
      {!entries.length && (
        <p className="card">
          {t('Open a bottle to start your tasting journal.')}
        </p>
      )}
      <div className="journal">
        {entries.map(({ b, e }) => (
          <article className="card" key={e.id}>
            <h2>
              <Link to={`/bottles/${b.id}`}>
                {b.name} {b.vintage}
              </Link>
            </h2>
            <p>
              <DateText value={e.date} /> · {e.quantity} {t('bottles')}{' '}
              {e.undone && `(${t('undone')})`}
            </p>
            <p>
              {t('Occasion')}: {e.occasion || '—'} · {t('People')}:{' '}
              {e.people || '—'}
            </p>
            <p>
              {t('Rating')}: {e.rating ?? '—'} / 5
            </p>
            <p>{e.notes}</p>
          </article>
        ))}
      </div>
    </>
  );
}
export function Statistics() {
  const { state, t, money } = useApp();
  const totals = summary(state);
  const groups = [
    'type',
    'cellarId',
    'origin',
    'country',
    'region',
    'vintage',
  ] as const;
  const consumption: Record<string, number> = {};
  state.bottles.forEach((b) =>
    b.history
      .filter((e) => e.kind === 'opened' && !e.undone)
      .forEach((e) => {
        consumption[e.date.slice(0, 7)] =
          (consumption[e.date.slice(0, 7)] ?? 0) + (e.quantity ?? 0);
      }),
  );
  const chart = (
    title: string,
    data: Record<string, number>,
    isValue = false,
  ) => {
    const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
    const total = entries.reduce((n, [, value]) => n + value, 0);
    return (
      <section className="card" key={title}>
        <h2>{t(title)}</h2>
        <p>
          {t('Total')}: {isValue ? money(total) : total}{' '}
          {isValue ? '' : t('bottles')}
        </p>
        <div className="chart" aria-hidden="true">
          {entries.map(([label, value]) => (
            <div key={label}>
              <span>{label || t('Unknown')}</span>
              <div className="bar-track">
                <span
                  className="bar"
                  style={{ width: `${total ? (value / total) * 100 : 0}%` }}
                />
              </div>
              <strong>{isValue ? money(value) : value}</strong>
            </div>
          ))}
        </div>
        <details open>
          <summary>{t('Data table')}</summary>
          <table>
            <caption>{t(title)}</caption>
            <thead>
              <tr>
                <th scope="col">{t('Category')}</th>
                <th scope="col">{t(isValue ? 'Value' : 'Bottles')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label || t('Unknown')}</th>
                  <td>{isValue ? money(value) : value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
    );
  };
  return (
    <>
      <div className="heading-row">
        <h1>{t('Statistics')}</h1>
        <div className="actions">
          <button
            onClick={() =>
              download(
                exportCsv(state.bottles, state),
                'my-wine-cellar.csv',
                'text/csv',
              )
            }
          >
            {t('Export CSV')}
          </button>
          <button onClick={() => exportPdf(state, t)}>{t('Export PDF')}</button>
          <button onClick={() => window.print()}>{t('Print')}</button>
        </div>
      </div>
      <div className="kpis">
        <section className="card kpi">
          <h2>{t('Total bottles')}</h2>
          <strong>{totals.total}</strong>
        </section>
        <section className="card kpi">
          <h2>{t('Estimated value')}</h2>
          <strong>{money(totals.value)}</strong>
        </section>
      </div>
      <div className="statistics-grid">
        {groups.map((group) => {
          const counts: Record<string, number> = {};
          state.bottles
            .filter((b) => b.quantity > 0)
            .forEach((b) => {
              const key =
                group === 'cellarId'
                  ? (state.cellars.find((c) => c.id === b.cellarId)?.name ?? '')
                  : b[group];
              counts[key] = (counts[key] ?? 0) + b.quantity;
            });
          return chart(
            {
              type: 'By wine type',
              cellarId: 'By cellar',
              origin: 'By origin',
              country: 'By country',
              region: 'By region',
              vintage: 'By vintage',
            }[group],
            counts,
          );
        })}
        {chart(
          'Value by cellar',
          Object.fromEntries(
            state.cellars.map((c) => [
              c.name,
              state.bottles
                .filter((b) => b.cellarId === c.id)
                .reduce(
                  (n, b) => n + b.quantity * (b.value ?? b.price ?? 0),
                  0,
                ),
            ]),
          ),
          true,
        )}
        {chart('Consumption by month', consumption)}
      </div>
    </>
  );
}
