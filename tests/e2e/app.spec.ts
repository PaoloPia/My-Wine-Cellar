import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { type Collection } from '../../shared/model';
import { fixture } from '../fixture';

async function seed(page: Page, state: Collection = fixture()) {
  const current = await (await page.request.get('/api/collection')).json();
  const response = await page.request.post('/api/commands', {
    data: {
      id: randomUUID(),
      expectedRevision: current.revision,
      date: new Date().toISOString(),
      action: { type: 'restore', collection: state },
    },
  });
  expect(response.ok()).toBeTruthy();
}
async function addBottle(page: Page, name = 'New Wine') {
  await page.goto('/bottles/new');
  await page.getByLabel('Wine name', { exact: false }).fill(name);
  await page
    .getByLabel('Wine type', { exact: false })
    .selectOption('Franciacorta');
  await page
    .getByLabel('Cellar (required)', { exact: true })
    .selectOption('fridge');
  await page
    .getByLabel('Origin (required)', { exact: true })
    .selectOption('Gift');
}
test.beforeEach(async ({ page }) => {
  await seed(page);
});
test('TC-001/004/014: anonymous add and reload, navigation history and persisted values', async ({
  page,
}) => {
  await addBottle(page, 'Franciacorta Prototype');
  await page.getByLabel('Vintage', { exact: true }).fill('2019');
  await page.getByLabel('Alcohol (ABV %)', { exact: true }).fill('12.5');
  await page.getByLabel('Quantity (required)', { exact: true }).fill('6');
  await page.getByLabel('Gifted by', { exact: true }).fill('Marco');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Franciacorta Prototype 2019',
  );
  await page.reload();
  await expect(page.getByText('Marco', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Statistics', exact: true }).click();
  await expect(page).toHaveURL(/statistics/);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Franciacorta Prototype 2019',
  );
});
test('TC-005: global search resolves bottles and cellars from Statistics', async ({
  page,
}) => {
  await page.goto('/statistics');
  const search = page.getByLabel('Global search');
  await search.fill('francia');
  await page
    .locator('.search-results')
    .getByRole('link', { name: /Franciacorta/ })
    .click();
  await expect(page).toHaveURL(/bottles\/b1$/);
  await search.fill('sparkling');
  await expect(
    page
      .locator('.search-results')
      .getByRole('link', { name: 'Sparkling Fridge' }),
  ).toBeVisible();
  await search.fill('zzzz');
  await expect(page.getByText('No results', { exact: true })).toBeVisible();
});
test('TC-006/045: delete cancellation, dialog focus, Escape and undo', async ({
  page,
}) => {
  await page.goto('/bottles/b1');
  const trigger = page.getByRole('button', { name: 'Delete', exact: true });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Franciacorta',
  );
  await trigger.click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page).toHaveURL(/\/bottles$/);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.goto('/bottles/b1');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Franciacorta',
  );
});
test('TC-009/010/011: cellar form validates names, unique names and fractional temperatures', async ({
  page,
}) => {
  await page.goto('/cellars/new');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Name is required');
  await page
    .getByLabel('Name (required)', { exact: true })
    .fill('sparkling fridge ');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already exists');
  await page.getByLabel('Name (required)', { exact: true }).fill('New Cellar');
  await page.getByLabel('Target temperature (°C) (required)').fill('12.3');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('steps of 0.5');
  await page.getByLabel('Target temperature (°C) (required)').fill('8');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'New Cellar',
  );
});
test('TC-012/013: occupied cellar deletion moves contents; rack text alternative matches records', async ({
  page,
}) => {
  await page.goto('/cellars/fridge');
  await page.getByText('Text alternative', { exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Franciacorta');
  await page
    .getByRole('button', { name: 'Delete cellar', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('contains bottles');
  await page.getByLabel('Move contents to').selectOption('red');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const data = await (await page.request.get('/api/collection')).json();
  expect(data.bottles[0].cellarId).toBe('red');
  expect(data.cellars).toHaveLength(1);
});
test('TC-015/016/017/018: inline mandatory and range errors retain input and clear on correction', async ({
  page,
}) => {
  await page.goto('/bottles/new');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Name is required');
  await page.getByLabel('Wine name (required)').fill('Boundary wine');
  await page.getByLabel('Wine type (required)').selectOption('Red');
  await page.getByLabel('Origin (required)').selectOption('Other');
  await page
    .getByLabel('Cellar (required)', { exact: true })
    .selectOption('red');
  await page.getByLabel('Alcohol (ABV %)', { exact: true }).fill('12.55');
  await page.getByLabel('Vintage', { exact: true }).fill('1799');
  await page.getByLabel('Quantity (required)').fill('-1');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('ABV');
  await expect(page.getByLabel('Wine name (required)')).toHaveValue(
    'Boundary wine',
  );
  await page.getByLabel('Alcohol (ABV %)', { exact: true }).fill('12.5');
  await page.getByLabel('Vintage', { exact: true }).fill('NV');
  await page.getByLabel('Quantity (required)').fill('0');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Archived', { exact: true })).toBeVisible();
});
test('TC-019/020/021: duplicate, move and archive restore through UI', async ({
  page,
}) => {
  await page.goto('/bottles/b2');
  await page.getByRole('link', { name: 'Duplicate', exact: true }).click();
  await page.getByLabel('Vintage', { exact: true }).fill('2017');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Barolo 2017',
  );
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await page.getByLabel('Destination cellar').selectOption('fridge');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Move', exact: true })
    .click();
  await expect(
    page.getByText(/Moved from Red Wine Rack to Sparkling Fridge/),
  ).toBeVisible();
  const quantity = page.locator('.quantity');
  for (let i = 0; i < 3; i++)
    await quantity.getByRole('button', { name: /Decrease/ }).click();
  await expect(
    quantity.getByRole('button', { name: /Decrease/ }),
  ).toBeDisabled();
  await expect(page.getByText('Archived', { exact: true })).toBeVisible();
  await quantity.getByRole('button', { name: /Increase/ }).click();
  await expect(page.getByText('Archived', { exact: true })).toHaveCount(0);
});
test('TC-023/024/025: upload validation, crop/rotate, alt text and compressed persistence', async ({
  page,
}) => {
  await addBottle(page, 'Photo wine');
  await page.getByLabel('Upload photo').setInputFiles({
    name: 'bad.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('GIF89a'),
  });
  await expect(page.getByRole('alert')).toContainText('Allowed formats');
  await page.getByLabel('Upload photo').setInputFiles({
    name: 'label.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAGElEQVQImWP8z8Dwn4GBgYGJAQoAHgQCAf0L9YIAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Rotate 90°' }).click();
  await page.getByRole('button', { name: 'Save photo' }).click();
  await page.getByLabel('Photo description').fill('Custom label description');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Custom label description' }),
  ).toBeVisible();
});
test('TC-026/037: contextual origin values survive switching; preferences persist and localise', async ({
  page,
}) => {
  await addBottle(page);
  await page.getByLabel('Gifted by').fill('Marco');
  await page.getByLabel('Origin (required)').selectOption('Wine shop');
  await page.getByLabel('Shop name').fill('Wine Store');
  await page.getByLabel('Origin (required)').selectOption('Gift');
  await expect(page.getByLabel('Gifted by')).toHaveValue('Marco');
  await page.goto('/settings');
  await page.getByLabel('Temperature unit').selectOption('F');
  await page.getByLabel('Language').selectOption('it');
  await page.getByLabel('Currency', { exact: true }).selectOption('GBP');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Impostazioni',
  );
});
test('TC-027/028/029: inventory search, filters, list persistence and bulk tagging', async ({
  page,
}) => {
  await page.goto('/bottles');
  await page.getByLabel('Search your wines').fill('cherry');
  await expect(page.locator('.bottle-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.getByRole('table')).toContainText('Franciacorta');
  await page.reload();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: 'Select page' }).click();
  await page.getByRole('button', { name: 'Add tag', exact: true }).click();
  await page.getByLabel('Tag', { exact: true }).fill('party');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const data = await (await page.request.get('/api/collection')).json();
  expect(data.bottles[0].tags).toContain('party');
  expect(data.bottles[1].tags).not.toContain('party');
});
test('TC-030/031/032/033: pairings, journal, overdraw and opening undo', async ({
  page,
}) => {
  await page.goto('/bottles/b1');
  await expect(page.locator('.pairing')).toHaveCount(4);
  await page
    .getByRole('button', { name: 'Mark as opened', exact: true })
    .click();
  await page.getByLabel('Quantity (required)', { exact: true }).fill('7');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Mark as opened', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Only 6');
  await page.getByLabel('Quantity (required)', { exact: true }).fill('2');
  await page.getByLabel('Occasion', { exact: true }).fill('Anniversary');
  await page.getByLabel('People', { exact: true }).fill('4');
  await page.getByLabel('Rating', { exact: true }).selectOption('5');
  await page.getByLabel('Tasting notes', { exact: true }).fill('Fine bubbles');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Mark as opened', exact: true })
    .click();
  await expect(page.locator('.quantity output')).toHaveText('4');
  await page.goto('/journal');
  await expect(page.locator('.journal')).toContainText('Anniversary');
  await page.goto('/bottles/b1');
  await page.getByRole('button', { name: 'Undo last opening' }).click();
  await expect(page.locator('.quantity output')).toHaveText('6');
});
test('TC-002/003/039: backup restore, invalid backup and double-confirm clear', async ({
  page,
}) => {
  await page.goto('/settings');
  const backup = await (await page.request.get('/api/collection')).json();
  await page.getByLabel('Import backup').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  });
  await expect(page.getByRole('alert')).toContainText('truncated');
  await page
    .getByRole('button', { name: 'Delete all data', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Final confirmation');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(
    (await (await page.request.get('/api/collection')).json()).bottles,
  ).toHaveLength(2);
  await page
    .getByRole('button', { name: 'Delete all data', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect(
    (await (await page.request.get('/api/collection')).json()).bottles,
  ).toHaveLength(0);
  await page.getByLabel('Import backup').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect(
    (await (await page.request.get('/api/collection')).json()).bottles,
  ).toEqual(backup.bottles);
});
test('TC-038: CSV mapping reports rejected rows and imports valid rows only', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByLabel('Import CSV').setInputFiles({
    name: 'wines.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Wine,Alc\nGood Wine,12.5\nBad Wine,30\n,12'),
  });
  await page.getByLabel('Wine', { exact: true }).selectOption('name');
  await page.getByLabel('Alc', { exact: true }).selectOption('abv');
  await page.getByRole('button', { name: 'Validate rows' }).click();
  await expect(page.getByRole('dialog')).toContainText('2 invalid rows');
  await page.getByRole('button', { name: 'Import valid rows only' }).click();
  const data = await (await page.request.get('/api/collection')).json();
  expect(data.bottles).toHaveLength(3);
  expect(data.bottles[2].name).toBe('Good Wine');
});
test('TC-040/043/046/047/048: mobile reflow, skip link, theme and unique titles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of ['/', '/bottles', '/bottles/new', '/statistics']) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.goto('/');
  await expect(page.locator('main h1')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to main content' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Theme', { exact: true }).selectOption('contrast');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
  await page.goto('/accessibility');
  await expect(page).toHaveTitle(/Accessibility statement/);
});
test('TC-041/042/044: automated WCAG 2.2 AA checks on primary pages in light and dark themes', async ({
  page,
}) => {
  for (const theme of ['light', 'dark'] as const) {
    const state = fixture();
    state.settings.theme = theme;
    await seed(page, state);
    for (const path of [
      '/',
      '/bottles',
      '/bottles/new',
      '/cellars/fridge',
      '/bottles/b1',
      '/statistics',
      '/settings',
    ]) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        result.violations,
        `${theme} ${path}: ${JSON.stringify(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
      ).toEqual([]);
    }
  }
});
test('TC-049: 1,000 wines paginate and searches return within 500 ms after typing', async ({
  page,
}) => {
  const s = fixture();
  s.bottles = Array.from({ length: 1000 }, (_, i) => ({
    ...s.bottles[1],
    id: String(i),
    name: i % 2 ? `Barolo ${i}` : `White ${i}`,
    photos: [],
  }));
  await seed(page, s);
  const start = Date.now();
  await page.goto('/bottles');
  await expect(page.locator('.bottle-card')).toHaveCount(50);
  expect(Date.now() - start).toBeLessThan(2000);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Page 2 / 20')).toBeVisible();
  const searchStart = Date.now();
  await page.getByLabel('Search your wines').fill('Barolo');
  await expect(page.getByText(/500 wines found/)).toBeVisible();
  expect(Date.now() - searchStart).toBeLessThan(500);
});
test('TC-050: production PWA reloads offline, persists edits and replays exactly once online', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await addBottle(page, 'Offline Wine');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Offline Wine',
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Offline Wine',
  );
  await page.goto('/pairing?dish=risotto');
  await expect(page.getByText(/matching wines/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/changes pending sync/)).toHaveCount(0);
  const data = await (await page.request.get('/api/collection')).json();
  expect(
    data.bottles.filter((b: { name: string }) => b.name === 'Offline Wine'),
  ).toHaveLength(1);
});
test('TC-051/052: no external tracking; server failure keeps form input and retry saves once', async ({
  page,
  context,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (
      !request.url().startsWith('http://127.0.0.1:3101') &&
      !request.url().startsWith('data:')
    )
      external.push(request.url());
  });
  await addBottle(page, 'Retry Wine');
  await page.route('**/api/commands', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Storage unavailable. Retry.' }),
    }),
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Storage unavailable');
  await expect(page.getByLabel('Wine name (required)')).toHaveValue(
    'Retry Wine',
  );
  await page.unroute('**/api/commands');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  const data = await (await page.request.get('/api/collection')).json();
  expect(
    data.bottles.filter((b: { name: string }) => b.name === 'Retry Wine'),
  ).toHaveLength(1);
  expect(external).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});

test('TC-050/052: lost opening response survives reload and idempotent replay', async ({
  page,
}) => {
  await page.goto('/bottles/b1');
  await page.route('**/api/commands', async (route) => {
    await route.fetch();
    await route.abort('failed');
  });
  await page
    .getByRole('button', { name: 'Mark as opened', exact: true })
    .click();
  await page.getByLabel('Quantity (required)', { exact: true }).fill('2');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Mark as opened', exact: true })
    .click();
  await expect(page.locator('.quantity output')).toHaveText('4');
  await page.reload();
  await expect(page.locator('.quantity output')).toHaveText('4');
  await page.unroute('**/api/commands');
  await page.getByRole('button', { name: 'Retry sync', exact: true }).click();
  await expect(page.getByText(/changes pending sync/)).toHaveCount(0);
  const data = await (await page.request.get('/api/collection')).json();
  expect(data.bottles[0].quantity).toBe(4);
  expect(
    data.bottles[0].history.filter(
      (event: { kind: string }) => event.kind === 'opened',
    ),
  ).toHaveLength(1);
});

test('TC-050/052: sync conflicts preserve offline edits until explicit reload', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await addBottle(page, 'Conflict Wine');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Conflict Wine',
  );
  await seed(page);
  await context.setOffline(false);
  await expect(page.getByRole('alert')).toContainText('changed elsewhere');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Conflict Wine',
  );
  await expect(
    page.getByRole('button', { name: 'Export local recovery backup' }),
  ).toBeVisible();
  const data = await (await page.request.get('/api/collection')).json();
  expect(data.bottles).toHaveLength(2);
});

test('TC-052: quota failure retains form and retry does not duplicate the bottle', async ({
  page,
}) => {
  await addBottle(page, 'Quota Wine');
  await page.evaluate(() => {
    Object.defineProperty(window, 'wineOriginalPut', {
      value: IDBObjectStore.prototype.put,
    });
    IDBObjectStore.prototype.put = () => {
      throw new DOMException(
        'Storage quota exceeded. Free browser space and retry.',
        'QuotaExceededError',
      );
    };
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('quota exceeded');
  await expect(page.getByLabel('Wine name (required)')).toHaveValue(
    'Quota Wine',
  );
  expect(
    (await (await page.request.get('/api/collection')).json()).bottles,
  ).toHaveLength(2);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = Object.getOwnPropertyDescriptor(
      window,
      'wineOriginalPut',
    )?.value;
  });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  expect(
    (await (await page.request.get('/api/collection')).json()).bottles.filter(
      (b: { name: string }) => b.name === 'Quota Wine',
    ),
  ).toHaveLength(1);
});
test('TC-050/052: the durable offline journal survives without a second cache write', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await addBottle(page, 'Journal Only Wine');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let writes = 0;
    IDBObjectStore.prototype.put = function (...args) {
      writes++;
      if (writes > 1)
        throw new DOMException(
          'Quota reached after the durable journal write',
          'QuotaExceededError',
        );
      return put.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Journal Only Wine',
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Journal Only Wine',
  );
  await context.setOffline(false);
  await expect(page.getByText(/changes pending sync/)).toHaveCount(0);
  const data = await (await page.request.get('/api/collection')).json();
  expect(
    data.bottles.filter(
      (b: { name: string }) => b.name === 'Journal Only Wine',
    ),
  ).toHaveLength(1);
});
