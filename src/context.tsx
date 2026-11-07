import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Action } from '../shared/commands';
import type { Collection } from '../shared/model';
import { ClientRepository } from './client';
import { translator } from './i18n';

type Toast = { id: number; text: string; undo?: Action; deadline: number };
type AppContext = {
  state: Collection;
  t: (key: string) => string;
  mutate: (action: Action, message?: string, undo?: Action) => Promise<void>;
  notify: (text: string) => void;
  money: (n: number) => string;
  offline: boolean;
  pending: number;
  syncError: string;
  sync: () => Promise<void>;
  reloadServer: () => Promise<void>;
  busy: boolean;
};
const Context = createContext<AppContext | null>(null);
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing application provider');
  return value;
}
export function Provider({ children }: { children: ReactNode }) {
  const repository = useRef(new ClientRepository()).current;
  const [state, setState] = useState<Collection>();
  const [error, setError] = useState('');
  const [toast, setToast] = useState<Toast>();
  const [offline, setOffline] = useState(!navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncError, setSyncError] = useState('');
  const [busy, setBusy] = useState(false);
  const loaded = !!state;
  const t = translator(state?.settings.language ?? 'en');
  const notify = (text: string, undo?: Action) =>
    setToast({
      id: Date.now(),
      text,
      undo,
      deadline:
        Date.now() + (state?.settings.notificationDuration ?? 15) * 1000,
    });
  useEffect(() => {
    repository
      .load()
      .then((s) => {
        setState(s);
        setPending(repository.queue.length);
      })
      .catch((e: Error) => setError(e.message));
  }, [repository]);
  useEffect(() => {
    const online = () => setOffline(false);
    const offline = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);
  useEffect(() => {
    if (!loaded || offline || !pending) return;
    let active = true;
    repository
      .sync()
      .then((s) => {
        if (active) {
          setState(s);
          setPending(repository.queue.length);
          setSyncError('');
        }
      })
      .catch((e: Error) => {
        if (active) setSyncError(e.message);
      });
    return () => {
      active = false;
    };
  }, [offline, pending, repository, loaded]);
  useEffect(() => {
    if (!state) return;
    const { theme, textSize, language, reducedMotion } = state.settings;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme);
    apply();
    media.addEventListener('change', apply);
    document.documentElement.lang = language;
    document.documentElement.style.fontSize = `${textSize}%`;
    document.documentElement.dataset.motion = reducedMotion
      ? 'reduced'
      : 'normal';
    return () => media.removeEventListener('change', apply);
  }, [state]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => setToast(undefined),
      Math.max(0, toast.deadline - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [toast]);
  async function mutate(action: Action, message?: string, undo?: Action) {
    setBusy(true);
    try {
      const s = await repository.execute(action, state?.revision);
      setState(s);
      setPending(repository.queue.length);
      if (message) notify(message, undo);
    } catch (error) {
      setState(repository.state);
      setPending(repository.queue.length);
      if (repository.queue.length)
        setSyncError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }
  const sync = async () => {
    try {
      setState(await repository.sync());
      setPending(repository.queue.length);
      setSyncError('');
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
    }
  };
  if (error)
    return (
      <main className="startup">
        <h1>{t('Unable to load collection')}</h1>
        <p role="alert">{error}</p>
        <button onClick={() => location.reload()}>{t('Retry')}</button>
      </main>
    );
  if (!state)
    return (
      <main className="startup" role="status">
        {t('Loading your cellar…')}
      </main>
    );
  return (
    <Context.Provider
      value={{
        state,
        t,
        mutate,
        notify,
        money: (n) =>
          new Intl.NumberFormat(state.settings.language, {
            style: 'currency',
            currency: state.settings.currency,
          }).format(n),
        offline,
        pending,
        syncError,
        sync,
        busy,
        reloadServer: async () => {
          setState(await repository.reloadServer());
          setPending(0);
          setSyncError('');
        },
      }}
    >
      {children}
      <div className="live-toast" aria-live="polite" aria-atomic="true">
        {toast && (
          <div className="toast">
            <span>{toast.text}</span>
            {toast.undo && (
              <button
                onClick={async () => {
                  try {
                    await mutate(toast.undo!, t('Undo completed'));
                  } catch (e) {
                    notify(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                {t('Undo')}
              </button>
            )}
            <button
              aria-label={t('Dismiss message')}
              onClick={() => setToast(undefined)}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </Context.Provider>
  );
}
