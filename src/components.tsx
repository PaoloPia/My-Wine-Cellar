import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Wine } from 'lucide-react';
import { useApp } from './context';
import {
  drinkingStatus,
  formatDate,
  temperature,
  type Bottle,
  type Cellar,
} from '../shared/model';
import { DomainError, fieldsFromError } from '../shared/commands';
import { ZodError } from 'zod';

export function errorDetails(e: unknown) {
  if (e instanceof DomainError) return { message: e.message, fields: e.fields };
  if (e instanceof ZodError)
    return {
      message: 'Please correct the highlighted fields',
      fields: Object.fromEntries(
        Object.entries(fieldsFromError(e)).map(([key, value]) => [
          key.replace(/^(action\.)?(bottle\.|cellar\.)?/, ''),
          value,
        ]),
      ),
    };
  return { message: e instanceof Error ? e.message : String(e), fields: {} };
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const prior = document.activeElement;
    ref.current?.showModal();
    return () => {
      if (prior instanceof HTMLElement && prior.isConnected) prior.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="heading-row">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          aria-label={useApp().t('Close dialog')}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  name,
  label,
  required,
  error,
  children,
  help,
}: {
  name: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  help?: string;
}) {
  const { t } = useApp();
  return (
    <div className={`field ${error ? 'invalid' : ''}`}>
      <label htmlFor={name}>
        {t(label)}
        {required && <span className="required"> ({t('required')})</span>}
      </label>
      {children}
      {help && <small id={`${name}-help`}>{t(help)}</small>}
      {error && (
        <small className="error" id={`${name}-error`}>
          {t(error)}
        </small>
      )}
    </div>
  );
}
export function ErrorSummary({
  message,
  fields = {},
}: {
  message: string;
  fields?: Record<string, string>;
}) {
  const { t } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  if (!message) return null;
  return (
    <div className="error-summary" role="alert" tabIndex={-1} ref={ref}>
      <strong>{t(message)}</strong>
      {!!Object.keys(fields).length && (
        <ul>
          {Object.entries(fields).map(([key, value]) => (
            <li key={key}>
              <a
                href={`#${key.replace(/^(bottle|cellar)\./, '')}`}
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById(key.replace(/^(bottle|cellar)\./, ''))
                    ?.focus();
                }}
              >
                {t(value)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
export function BottleImage({
  bottle,
  large = false,
}: {
  bottle: Bottle;
  large?: boolean;
}) {
  return bottle.photos[0] ? (
    <img
      className={`bottle-image ${large ? 'large' : ''}`}
      src={bottle.photos[0].src}
      alt={bottle.photos[0].alt}
      loading={large ? 'eager' : 'lazy'}
    />
  ) : (
    <div
      className={`bottle-placeholder ${large ? 'large' : ''}`}
      data-type={bottle.type}
      aria-hidden="true"
    >
      <Wine size={large ? 140 : 76} />
      <span>{bottle.type}</span>
    </div>
  );
}
export function Status({ bottle }: { bottle: Bottle }) {
  const { t } = useApp();
  const status = drinkingStatus(bottle);
  return (
    <span className="badge" data-status={status}>
      {t(bottle.quantity === 0 ? 'Archived' : status)}
    </span>
  );
}
export function Quantity({ bottle }: { bottle: Bottle }) {
  const { t, mutate, notify, busy } = useApp();
  const change = async (delta: 1 | -1) => {
    try {
      await mutate(
        { type: 'quantity', id: bottle.id, delta },
        t(
          bottle.quantity === 1 && delta === -1
            ? 'Bottle archived'
            : 'Quantity updated',
        ),
      );
    } catch (e) {
      notify(errorDetails(e).message);
    }
  };
  return (
    <div className="quantity">
      <button
        disabled={bottle.quantity === 0 || busy}
        aria-label={`${t('Decrease quantity')}: ${bottle.name}`}
        onClick={() => change(-1)}
      >
        −
      </button>
      <output aria-label={t('Quantity')}>{bottle.quantity}</output>
      <button
        disabled={busy}
        aria-label={`${t('Increase quantity')}: ${bottle.name}`}
        onClick={() => change(1)}
      >
        +
      </button>
    </div>
  );
}
export function BottleCard({
  bottle,
  select,
  selected,
}: {
  bottle: Bottle;
  select?: () => void;
  selected?: boolean;
}) {
  const { t, state } = useApp();
  return (
    <article className="bottle-card card">
      {select && (
        <label className="selection">
          <input
            type="checkbox"
            checked={selected}
            onChange={select}
            aria-label={`${t('Select')}: ${bottle.name}`}
          />
          <span>{t('Select')}</span>
        </label>
      )}
      <Link
        to={`/bottles/${bottle.id}`}
        className="image-link"
        aria-label={`${bottle.name}, ${bottle.vintage}`}
      >
        <BottleImage bottle={bottle} />
      </Link>
      <h3>
        <Link to={`/bottles/${bottle.id}`}>
          {bottle.name} {bottle.vintage}
        </Link>
      </h3>
      <div className="row">
        <span className="badge">{t(bottle.type)}</span>
        <Status bottle={bottle} />
      </div>
      <p className="muted">
        {bottle.abv === undefined ? '—' : `${bottle.abv}%`} ·{' '}
        {state.cellars.find((c) => c.id === bottle.cellarId)?.name}
      </p>
      <Quantity bottle={bottle} />
    </article>
  );
}
export function DateText({ value }: { value: string }) {
  const { state } = useApp();
  return (
    <time dateTime={value}>{formatDate(value, state.settings.dateFormat)}</time>
  );
}
export function Temperature({ value }: { value: number }) {
  const { state } = useApp();
  return <>{temperature(value, state.settings.unit)}</>;
}
export function Confirm({
  title,
  message,
  confirm,
  close,
  children,
}: {
  title: string;
  message: string;
  confirm: () => Promise<void>;
  close: () => void;
  children?: ReactNode;
}) {
  const { t } = useApp();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={close}>
      <p>{message}</p>
      {children}
      <ErrorSummary message={error} />
      <div className="actions">
        <button
          className="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await confirm();
              close();
            } catch (e) {
              setError(errorDetails(e).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('Confirm')}
        </button>
        <button onClick={close}>{t('Cancel')}</button>
      </div>
    </Modal>
  );
}
export function MoveDialog({
  bottles,
  onClose,
}: {
  bottles: Bottle[];
  onClose: () => void;
}) {
  const { state, t, mutate } = useApp();
  const [target, setTarget] = useState('');
  const [position, setPosition] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={t('Move bottles')} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await mutate(
              {
                type: 'move',
                ids: bottles.map((b) => b.id),
                cellarId: target,
                position,
              },
              t('Bottles moved'),
            );
            onClose();
          } catch (err) {
            setError(errorDetails(err).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorSummary message={error} />
        <Field name="move-cellar" label="Destination cellar" required>
          <select
            id="move-cellar"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
          >
            <option value="">{t('Choose…')}</option>
            {state.cellars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field name="move-position" label="Shelf / position">
          <input
            id="move-position"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
        </Field>
        <div className="actions">
          <button className="primary" disabled={busy}>
            {t('Move')}
          </button>
          <button type="button" onClick={onClose}>
            {t('Cancel')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Rack({ cellar }: { cellar: Cellar }) {
  const { state, t } = useApp();
  const bottles = state.bottles.filter(
    (b) => b.cellarId === cellar.id && b.quantity > 0,
  );
  const slots = new Map<string, Bottle[]>();
  const unassigned: Bottle[] = [];
  bottles.forEach((b) => {
    const [s, p] = b.position.split('/').map(Number);
    if (
      !Number.isInteger(s) ||
      !Number.isInteger(p) ||
      s < 1 ||
      s > cellar.shelves ||
      p < 1 ||
      p > cellar.positions
    )
      unassigned.push(b);
    else slots.set(`${s}/${p}`, [...(slots.get(`${s}/${p}`) ?? []), b]);
  });
  return (
    <section className="card">
      <h2>{t('Rack preview')}</h2>
      <p className="muted">
        {t(
          'Each slot shows assigned wine entries, not individual bottles. Unassigned bottles are listed below.',
        )}
      </p>
      <div className="rack" role="list">
        {Array.from({ length: cellar.shelves }, (_, row) => (
          <div className="rack-row" role="listitem" key={row}>
            <strong>
              {t('Shelf')} {row + 1}
            </strong>
            <div className="slots">
              {Array.from({ length: cellar.positions }, (_, column) => {
                const key = `${row + 1}/${column + 1}`;
                const assigned = slots.get(key);
                return assigned ? (
                  <Link
                    key={key}
                    to={`/bottles/${assigned[0].id}`}
                    className="slot occupied"
                    aria-label={`${t('Position')} ${key}: ${assigned.map((b) => `${b.name} (${b.quantity})`).join(', ')}`}
                  >
                    {assigned.reduce((n, b) => n + b.quantity, 0)}
                  </Link>
                ) : (
                  <span
                    key={key}
                    className="slot"
                    aria-label={`${t('Position')} ${key}: ${t('Empty')}`}
                  >
                    –
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <details>
        <summary>{t('Text alternative')}</summary>
        <div className="table-scroll">
          <table>
            <caption>{cellar.name}</caption>
            <thead>
              <tr>
                <th>{t('Wine')}</th>
                <th>{t('Position')}</th>
                <th>{t('Quantity')}</th>
              </tr>
            </thead>
            <tbody>
              {bottles.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link to={`/bottles/${b.id}`}>{b.name}</Link>
                  </td>
                  <td>{b.position || t('Unassigned')}</td>
                  <td>{b.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p>
        {t('Unassigned')}: {unassigned.reduce((n, b) => n + b.quantity, 0)}{' '}
        {t('bottles')}
      </p>
    </section>
  );
}
