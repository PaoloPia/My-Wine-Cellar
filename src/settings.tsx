import { useState } from 'react';
import { useApp } from './context';
import {
  Confirm,
  ErrorSummary,
  Field,
  Modal,
  errorDetails,
} from './components';
import {
  collectionSchema,
  emptyCollection,
  today,
  type Bottle,
  type Settings,
} from '../shared/model';
import { exportCsv, parseCsv, validateCsv, csvFields } from '../shared/csv';
import { download, exportPdf } from './reports';

export function SettingsPage() {
  const { state, t, mutate, notify, busy } = useApp();
  const [draft, setDraft] = useState(state.settings);
  const [error, setError] = useState('');
  const [clear, setClear] = useState(0);
  const [restore, setRestore] =
    useState<ReturnType<typeof collectionSchema.parse>>();
  const [csv, setCsv] = useState<ReturnType<typeof parseCsv>>();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [report, setReport] = useState<{
    valid: Bottle[];
    errors: { row: number; message: string }[];
  }>();
  const [listKey, setListKey] = useState<keyof Settings['lists']>('origins');
  const [newOption, setNewOption] = useState('');
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((s) => ({ ...s, [key]: value }));
  const select = (
    key:
      | 'unit'
      | 'currency'
      | 'language'
      | 'dateFormat'
      | 'theme'
      | 'defaultCellar',
    label: string,
    options: [string, string][],
  ) => (
    <Field name={`setting-${key}`} label={label}>
      <select
        id={`setting-${key}`}
        value={draft[key]}
        onChange={(e) => change(key, e.target.value as Settings[typeof key])}
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {t(label)}
          </option>
        ))}
      </select>
    </Field>
  );
  const backup = () =>
    download(
      JSON.stringify(state, null, 2),
      `my-wine-cellar-${today()}.json`,
      'application/json',
    );
  async function loadBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024)
        throw new Error('Backup exceeds 100 MB');
      const data = JSON.parse(await file.text());
      if (data.version !== 1) throw new Error('Unsupported backup version');
      setRestore(collectionSchema.parse(data));
      setError('');
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? t('Backup is not valid JSON or is truncated')
          : errorDetails(e).message,
      );
    }
  }
  return (
    <>
      <h1>{t('Settings')}</h1>
      <ErrorSummary message={error} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await mutate(
              { type: 'settings', settings: draft },
              t('Preferences saved'),
            );
            setError('');
          } catch (err) {
            setError(errorDetails(err).message);
          }
        }}
      >
        <section className="card">
          <h2>{t('Accessibility')}</h2>
          <div className="form-grid">
            {select('theme', 'Theme', [
              ['system', 'Follow system'],
              ['light', 'Light'],
              ['dark', 'Dark'],
              ['contrast', 'High contrast'],
            ])}
            <Field name="setting-textSize" label="Text size">
              <select
                id="setting-textSize"
                value={draft.textSize}
                onChange={(e) => change('textSize', +e.target.value)}
              >
                {[100, 120, 150, 200].map((n) => (
                  <option key={n} value={n}>
                    {n}%
                  </option>
                ))}
              </select>
            </Field>
            <Field
              name="setting-duration"
              label="Notification duration (seconds)"
            >
              <input
                id="setting-duration"
                type="number"
                min="10"
                max="120"
                value={draft.notificationDuration}
                onChange={(e) =>
                  change('notificationDuration', +e.target.value)
                }
              />
            </Field>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.reducedMotion}
              onChange={(e) => change('reducedMotion', e.target.checked)}
            />
            {t('Reduce motion')}
          </label>
        </section>
        <section className="card">
          <h2>{t('Preferences')}</h2>
          <div className="form-grid">
            {select('unit', 'Temperature unit', [
              ['C', '°C'],
              ['F', '°F'],
            ])}
            {select(
              'currency',
              'Currency',
              ['EUR', 'GBP', 'USD', 'CHF'].map((c) => [c, c]),
            )}
            {select('language', 'Language', [
              ['en', 'English'],
              ['it', 'Italiano'],
            ])}
            {select(
              'dateFormat',
              'Date format',
              ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].map((f) => [f, f]),
            )}
            {select('defaultCellar', 'Default cellar', [
              ['', 'No default'],
              ...state.cellars.map((c): [string, string] => [c.id, c.name]),
            ])}
            <Field name="low-stock" label="Low stock threshold">
              <input
                id="low-stock"
                type="number"
                min="0"
                max="100"
                value={draft.lowStock}
                onChange={(e) => change('lowStock', +e.target.value)}
              />
            </Field>
          </div>
        </section>
        <section className="card">
          <h2>{t('Configurable lists')}</h2>
          <Field name="list-kind" label="List">
            <select
              id="list-kind"
              value={listKey}
              onChange={(e) =>
                setListKey(e.target.value as keyof Settings['lists'])
              }
            >
              {[
                ['types', 'Wine types'],
                ['origins', 'Origins'],
                ['sizes', 'Bottle sizes'],
                ['tags', 'Tags'],
              ].map(([key, label]) => (
                <option key={key} value={key}>
                  {t(label)}
                </option>
              ))}
            </select>
          </Field>
          <div className="config-list">
            {draft.lists[listKey].map((option, index) => (
              <div className="toolbar" key={index}>
                <Field name={`option-${index}`} label="Option name">
                  <input
                    id={`option-${index}`}
                    value={option.name}
                    maxLength={100}
                    onChange={(e) =>
                      change('lists', {
                        ...draft.lists,
                        [listKey]: draft.lists[listKey].map((o, i) =>
                          index === i ? { ...o, name: e.target.value } : o,
                        ),
                      })
                    }
                  />
                </Field>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={option.hidden}
                    onChange={(e) =>
                      change('lists', {
                        ...draft.lists,
                        [listKey]: draft.lists[listKey].map((o, i) =>
                          index === i ? { ...o, hidden: e.target.checked } : o,
                        ),
                      })
                    }
                  />
                  {t('Hidden')}
                </label>
              </div>
            ))}
          </div>
          <div className="toolbar">
            <Field name="new-option" label="New option">
              <input
                id="new-option"
                value={newOption}
                maxLength={100}
                onChange={(e) => setNewOption(e.target.value)}
              />
            </Field>
            <button
              type="button"
              disabled={!newOption.trim()}
              onClick={() => {
                if (
                  draft.lists[listKey].some(
                    (o) =>
                      o.name.toLowerCase() === newOption.trim().toLowerCase(),
                  )
                ) {
                  setError(t('Option already exists'));
                  return;
                }
                change('lists', {
                  ...draft.lists,
                  [listKey]: [
                    ...draft.lists[listKey],
                    { name: newOption.trim(), hidden: false },
                  ],
                });
                setNewOption('');
              }}
            >
              {t('Add option')}
            </button>
          </div>
        </section>
        <div className="actions">
          <button className="primary" disabled={busy}>
            {t('Save preferences')}
          </button>
        </div>
      </form>
      <section className="card">
        <h2>{t('Data and backups')}</h2>
        <p>
          {t(
            'Backups include every cellar, bottle, photo, history event and preference. Restoring replaces the collection; make a backup first.',
          )}
        </p>
        <div className="actions">
          <button onClick={backup}>{t('Export full backup')}</button>
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
        </div>
        <Field name="backup-import" label="Import backup">
          <input
            id="backup-import"
            type="file"
            accept=".json"
            onChange={(e) => {
              loadBackup(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </Field>
        <Field name="csv-import" label="Import CSV">
          <input
            id="csv-import"
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              try {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 20 * 1024 * 1024)
                  throw new Error('CSV exceeds 20 MB');
                const result = parseCsv(await file.text());
                setCsv(result);
                setMapping(
                  Object.fromEntries(
                    result.headers.map((h) => [
                      h,
                      csvFields.includes(h as (typeof csvFields)[number])
                        ? h
                        : '',
                    ]),
                  ),
                );
                setReport(undefined);
                setError('');
              } catch (err) {
                setError(errorDetails(err).message);
              } finally {
                e.target.value = '';
              }
            }}
          />
        </Field>
        <button className="danger" onClick={() => setClear(1)}>
          {t('Delete all data')}
        </button>
      </section>
      {restore && (
        <Confirm
          title={t('Restore backup?')}
          message={`${restore.cellars.length} ${t('cellars')}, ${restore.bottles.length} ${t('wines')}. ${t('Your current collection will be replaced.')}`}
          close={() => setRestore(undefined)}
          confirm={async () => {
            await mutate(
              { type: 'restore', collection: restore },
              `${t('Backup restored')}: ${restore.bottles.length} ${t('wines')}`,
            );
            setDraft(restore.settings);
          }}
        >
          <button onClick={backup}>{t('Export full backup')}</button>
        </Confirm>
      )}
      {clear > 0 && (
        <Confirm
          key={clear}
          title={t(clear === 1 ? 'Delete all data?' : 'Final confirmation')}
          message={t(
            clear === 1
              ? 'Export a backup first. This removes all bottles, cellars, photos and history.'
              : 'This action cannot be undone. Confirm again to permanently delete the entire collection.',
          )}
          close={() => setClear(0)}
          confirm={async () => {
            if (clear === 1) setTimeout(() => setClear(2), 0);
            else {
              await mutate(
                { type: 'clear', confirmation: 'DELETE ALL DATA' },
                t('All data deleted'),
              );
              setDraft(emptyCollection().settings);
            }
          }}
        />
      )}
      {csv && (
        <Modal
          title={t('CSV column mapping')}
          onClose={() => setCsv(undefined)}
        >
          <p>
            {csv.rows.length}{' '}
            {t(
              'rows found. Map columns, then review validation before importing.',
            )}
          </p>
          <div className="form-grid">
            {csv.headers.map((h, i) => (
              <Field key={h} name={`mapping-${i}`} label={h}>
                <select
                  id={`mapping-${i}`}
                  value={mapping[h] ?? ''}
                  onChange={(e) => {
                    setMapping((m) => ({ ...m, [h]: e.target.value }));
                    setReport(undefined);
                  }}
                >
                  <option value="">{t('Skip column')}</option>
                  {csvFields.map((field) => (
                    <option key={field} value={field}>
                      {t(field)}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <button
            onClick={() => {
              const values = Object.values(mapping).filter(Boolean);
              if (new Set(values).size !== values.length) {
                notify(t('Each destination field may be mapped only once'));
                return;
              }
              setReport(
                validateCsv(csv.rows, mapping, state, () =>
                  crypto.randomUUID(),
                ),
              );
            }}
          >
            {t('Validate rows')}
          </button>
          {report && (
            <section>
              <h3>{t('Validation report')}</h3>
              <p role="status">
                {report.valid.length} {t('valid rows')} · {report.errors.length}{' '}
                {t('invalid rows')}
              </p>
              <ul>
                {report.errors.map((e) => (
                  <li key={e.row}>
                    {t('Row')} {e.row}: {e.message}
                  </li>
                ))}
              </ul>
              <button
                className="primary"
                disabled={!report.valid.length || busy}
                onClick={() =>
                  mutate(
                    { type: 'import', bottles: report.valid },
                    `${t('Imported')}: ${report.valid.length}`,
                  )
                    .then(() => setCsv(undefined))
                    .catch((e) => notify(errorDetails(e).message))
                }
              >
                {t('Import valid rows only')}
              </button>
            </section>
          )}
          <button onClick={() => setCsv(undefined)}>{t('Cancel')}</button>
        </Modal>
      )}
    </>
  );
}
export function AccessibilityStatement() {
  const { t } = useApp();
  return (
    <>
      <h1>{t('Accessibility statement')}</h1>
      <section className="card">
        <h2>{t('Our accessibility goal')}</h2>
        <p>
          {t(
            'My Wine Cellar targets WCAG 2.2 AA and EN 301 549. Native controls, keyboard navigation, text alternatives, visible focus, chart tables, high contrast and reduced motion are provided.',
          )}
        </p>
        <h2>{t('Known limitations')}</h2>
        <p>
          {t(
            'This prototype is not certified as fully conformant. NVDA, JAWS, VoiceOver and TalkBack checks require manual execution on the target devices. PDF reports are not tagged; use CSV or the accessible web tables instead. HEIC conversion depends on browser codec support. Photo cropping supports a central crop and 90-degree rotation.',
          )}
        </p>
        <h2>{t('Feedback')}</h2>
        <p>
          {t(
            'Report accessibility issues to the application owner or use the project issue tracker when a repository is available. No public support address has been configured for this local prototype.',
          )}
        </p>
        <h2>{t('Wine terms')}</h2>
        <dl>
          <div>
            <dt>NV</dt>
            <dd>
              {t(
                'Non-vintage: a wine blended from more than one harvest year.',
              )}
            </dd>
          </div>
          <div>
            <dt>ABV</dt>
            <dd>
              {t('Alcohol by volume: the percentage of alcohol in a drink.')}
            </dd>
          </div>
          <div>
            <dt>Brut</dt>
            <dd>{t('A dry style of sparkling wine.')}</dd>
          </div>
          <div>
            <dt>DOCG</dt>
            <dd>
              {t('An Italian controlled and guaranteed designation of origin.')}
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}
