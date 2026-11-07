import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import {
  BarChart3,
  House,
  Menu,
  PlusCircle,
  Settings,
  Utensils,
  Warehouse,
  Wine,
} from 'lucide-react';
import { Provider, useApp } from './context';
import {
  Dashboard,
  Inventory,
  BottleDetail,
  Cellars,
  CellarDetail,
  FoodPairing,
  Journal,
  Statistics,
} from './pages';
import { BottleForm, CellarForm } from './forms';
import { AccessibilityStatement, SettingsPage } from './settings';
import { Confirm, Field } from './components';
import { searchBottle } from '../shared/model';
import { download } from './reports';
import './styles.css';

function Shell() {
  const { state, t, offline, pending, syncError, sync, reloadServer } =
    useApp();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const [reload, setReload] = useState(false);
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  useEffect(() => {
    setMenu(false);
    setQuery('');
    if (previousPath.current !== location.pathname)
      main.current?.focus({ preventScroll: true });
    previousPath.current = location.pathname;
  }, [location.pathname]);
  const navigation = [
    ['/', 'Dashboard', House],
    ['/bottles', 'My Bottles', Wine],
    ['/cellars', 'Cellars', Warehouse],
    ['/bottles/new', 'Add Bottle', PlusCircle],
    ['/pairing', 'Food Pairing', Utensils],
    ['/statistics', 'Statistics', BarChart3],
    ['/settings', 'Settings', Settings],
  ] as const;
  const bottles = query.trim()
    ? state.bottles.filter((b) => searchBottle(b, query)).slice(0, 8)
    : [];
  const cellars = query.trim()
    ? state.cellars
        .filter((c) =>
          `${c.name} ${c.description}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .slice(0, 5)
    : [];
  useEffect(() => {
    const titles: Record<string, string> = {
      '/': 'Dashboard',
      '/bottles': 'My Bottles',
      '/cellars': 'Cellars',
      '/bottles/new': 'Add Bottle',
      '/pairing': 'Food Pairing',
      '/statistics': 'Statistics',
      '/settings': 'Settings',
      '/journal': 'Tasting journal',
      '/accessibility': 'Accessibility statement',
      '/cellars/new': 'Add cellar',
    };
    const segments = location.pathname.split('/');
    const bottle =
      segments[1] === 'bottles'
        ? state.bottles.find((b) => b.id === segments[2])
        : undefined;
    const cellar =
      segments[1] === 'cellars'
        ? state.cellars.find((c) => c.id === segments[2])
        : undefined;
    document.title = `${bottle?.name ?? cellar?.name ?? t(titles[location.pathname] ?? 'My Wine Cellar')} – My Wine Cellar`;
  }, [location.pathname, state, t]);
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={() => main.current?.focus()}
      >
        {t('Skip to main content')}
      </a>
      <aside className={`sidebar ${menu ? 'expanded' : ''}`}>
        <Link to="/" className="brand">
          <Wine aria-hidden="true" />
          <span>
            My Wine
            <br />
            Cellar
          </span>
        </Link>
        <button
          className="mobile-menu"
          aria-expanded={menu}
          aria-controls="main-navigation"
          onClick={() => setMenu((m) => !m)}
        >
          <Menu aria-hidden="true" />
          {t('Menu')}
        </button>
        <nav id="main-navigation" aria-label={t('Main navigation')}>
          {navigation.map(([url, label, Icon]) => (
            <NavLink
              key={url}
              to={url}
              end={url === '/' || url === '/bottles'}
              className={({ isActive }) =>
                isActive &&
                !(url === '/bottles' && location.pathname === '/bottles/new')
                  ? 'active'
                  : ''
              }
            >
              <Icon aria-hidden="true" />
              <span>{t(label)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p>{t('A good wine has a story.')}</p>
          <Link to="/journal">{t('Tasting journal')}</Link>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="global-search">
            <Field name="global-search" label="Global search">
              <input
                id="global-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setQuery('');
                }}
                placeholder={t('Search wines and cellars…')}
              />
            </Field>
            {query.trim() && (
              <section
                className="search-results"
                aria-label={t('Search results')}
              >
                <p role="status">
                  {bottles.length + cellars.length} {t('results')}
                </p>
                <h2>{t('Bottles')}</h2>
                {bottles.map((b) => (
                  <Link key={b.id} to={`/bottles/${b.id}`}>
                    {b.name} {b.vintage}
                  </Link>
                ))}
                <h2>{t('Cellars')}</h2>
                {cellars.map((c) => (
                  <Link key={c.id} to={`/cellars/${c.id}`}>
                    {c.name}
                  </Link>
                ))}
                {!bottles.length && !cellars.length && <p>{t('No results')}</p>}
                <button onClick={() => setQuery('')}>
                  {t('Close search')}
                </button>
              </section>
            )}
          </div>
          <p className="muted" role="status">
            {t(offline ? 'Offline' : 'Local prototype')}
            {pending > 0 && ` · ${pending} ${t('changes pending sync')}`}
          </p>
        </header>
        {syncError && (
          <div className="error-summary" role="alert">
            <p>{syncError}</p>
            <div className="actions">
              <button
                onClick={() =>
                  download(
                    JSON.stringify(state),
                    'my-wine-cellar-local-recovery.json',
                    'application/json',
                  )
                }
              >
                {t('Export local recovery backup')}
              </button>
              <button onClick={sync}>{t('Retry sync')}</button>
              <button onClick={() => setReload(true)}>
                {t('Reload server collection')}
              </button>
            </div>
          </div>
        )}
        <main id="main" tabIndex={-1} ref={main}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/bottles" element={<Inventory />} />
            <Route path="/bottles/new" element={<BottleForm key="new" />} />
            <Route path="/bottles/:id" element={<BottleDetail />} />
            <Route
              path="/bottles/:id/edit"
              element={<BottleForm key={location.pathname} />}
            />
            <Route
              path="/bottles/:id/duplicate"
              element={<BottleForm key={location.pathname} duplicate />}
            />
            <Route path="/cellars" element={<Cellars />} />
            <Route path="/cellars/new" element={<CellarForm key="new" />} />
            <Route path="/cellars/:id" element={<CellarDetail />} />
            <Route
              path="/cellars/:id/edit"
              element={<CellarForm key={location.pathname} />}
            />
            <Route path="/pairing" element={<FoodPairing />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/accessibility" element={<AccessibilityStatement />} />
            <Route
              path="*"
              element={
                <>
                  <h1>{t('Page not found')}</h1>
                  <Link to="/">{t('Dashboard')}</Link>
                </>
              }
            />
          </Routes>
        </main>
        <footer>
          <span>
            My Wine Cellar · {t('Private. Local. No account needed.')}
          </span>
          <Link to="/accessibility">{t('Accessibility statement')}</Link>
        </footer>
      </div>
      {reload && (
        <Confirm
          title={t('Discard unsynced local changes?')}
          message={t(
            'Export a local recovery backup first. This replaces the browser copy with the server collection and clears pending changes.',
          )}
          close={() => setReload(false)}
          confirm={reloadServer}
        />
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Provider>
      <Shell />
    </Provider>
  </BrowserRouter>,
);
if (import.meta.env.PROD && 'serviceWorker' in navigator)
  navigator.serviceWorker
    .register('/sw.js')
    .catch((error) => console.error('Offline installation failed:', error));
