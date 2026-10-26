// Requires playwright-core on NODE_PATH and an installed Chromium browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

(async () => {
  const server = http.createServer((request, response) => {
    const file = path.resolve(root, '.' + decodeURIComponent(request.url.split('?')[0]));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html');
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const errors = [];
  try {
    for (const entry of ['/Ghostys_Bodybuilding_Return_Plan.html', '/app/src/main/assets/index.html']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
      await page.goto(origin + entry);
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('ghostyGainsData_v4'));
        s.setupComplete = true; s.tutorialCompleted = true;
        delete s.workoutSets; delete s.workoutSessions;
        s.workoutLog = [{ date: '2020-01-01', exId: 'legacy', name: 'Legacy exercise', group: 'chest' }];
        localStorage.setItem('ghostyGainsData_v4', JSON.stringify(s));
      });
      await page.reload();
      assert.equal(await page.locator('.tab-view.active').getAttribute('id'), 'tab-today');
      assert.equal(await page.locator('.today-metric').count(), 4);
      const value = () => page.evaluate(() => JSON.parse(localStorage.getItem('ghostyGainsData_v4')));
      assert.equal((await value()).workoutLog[0].exId, 'legacy');
      await page.locator('#btn-today-water').click();
      assert.equal((await value()).waterLogs.at(-1).ml, 250);
      await page.waitForFunction(() => document.getElementById('today-metrics').textContent.includes('250 ml'));
      await page.locator('#btn-today-food').click();
      assert.equal(await page.locator('#modal-food-actions').isVisible(), true);
      await page.locator('#btn-open-custom-food').click();
      assert.equal(await page.locator('#modal-food-actions').isVisible(), false);
      await page.keyboard.press('Escape');
      await page.locator('#nav-workouts').click();
      await page.locator('#workout-day-filter-bar button').filter({ hasText: 'Full Week' }).click();
      assert.equal(await page.locator('#workout-settings').getAttribute('open'), null);
      const first = page.locator('.day-card:not(.rest-day) .btn-log-sets').first();
      assert.ok(await first.isVisible());
      await first.click();
      const name = await page.locator('#set-log-title').textContent();
      const target = await page.locator('#set-log-target').textContent();
      const maxReps = +target.match(/×\s*\d+[–-](\d+)/)?.[1] || 12;
      const rows = page.locator('#set-log-rows .set-row');
      for (let i = 0; i < await rows.count(); i++) {
        await rows.nth(i).locator('[data-field="weight"]').fill('40');
        await rows.nth(i).locator('[data-field="reps"]').fill(String(maxReps));
        await rows.nth(i).locator('[data-field="rpe"]').fill('8');
      }
      await page.locator('#set-log-form button[type="submit"]').click();
      let saved = await value();
      assert.ok(saved.workoutSets.length >= 2); assert.equal(saved.workoutSets[0].weightKg, 40);
      assert.equal(saved.workoutSets[0].exerciseName, name); assert.equal(saved.workoutLog[0].exId, 'legacy');
      const sessionId = saved.workoutSets[0].sessionId;
      await page.reload(); await page.locator('#nav-workouts').click();
      await page.locator('#workout-day-filter-bar button').filter({ hasText: 'Full Week' }).click();
      await page.getByRole('button', { name: `Log sets for ${name}`, exact: true }).first().click();
      assert.equal(await rows.first().locator('[data-field="weight"]').inputValue(), '40');
      await page.locator('#set-weight-unit').selectOption('lb');
      assert.ok(Math.abs(+(await rows.first().locator('[data-field="weight"]').inputValue()) - 88.18) < .02);
      await page.locator('#set-weight-unit').selectOption('kg');
      await rows.first().locator('[data-field="weight"]').fill('45');
      await rows.first().locator('[data-field="rpe"]').fill('');
      await page.locator('#set-log-form button[type="submit"]').click();
      saved = await value();
      assert.equal(saved.workoutSessions.length, 1); assert.equal(saved.workoutSets[0].sessionId, sessionId);
      assert.equal(saved.workoutSets[0].rpe, null);
      assert.ok(await page.locator('.exercise-journal .record').filter({ hasText: '45 kg' }).count());
      await page.evaluate(() => {
        const key = 'ghostyGainsData_v4', s = JSON.parse(localStorage.getItem(key));
        const session = s.workoutSessions[0], old = session.date;
        session.date = window.GhostyDaily.shiftDate(old, -7);
        s.workoutSets.forEach(row => { row.date = session.date; });
        localStorage.setItem(key, JSON.stringify(s));
      });
      await page.reload(); await page.locator('#nav-workouts').click();
      await page.locator('#workout-day-filter-bar button').filter({ hasText: 'Full Week' }).click();
      await page.getByRole('button', { name: `Log sets for ${name}`, exact: true }).first().click();
      assert.ok((await page.locator('#set-log-previous').textContent()).includes('Last time'));
      assert.equal(await rows.first().locator('[data-field="weight"]').inputValue(), '');
      await page.locator('#btn-use-last-sets').click();
      assert.equal(await rows.first().locator('[data-field="weight"]').inputValue(), '45');
      await page.locator('#set-log-form button[type="submit"]').click();
      assert.equal((await value()).workoutSessions.length, 2);
      await page.locator('#nav-today').click();
      assert.ok((await page.locator('#weekly-review').textContent()).includes('1 / 7 days'));
      await page.locator('#btn-today-weight').click(); assert.equal(await page.locator('#subview-weight').isVisible(), true);
      await page.locator('#nav-today').click(); await page.locator('#btn-today-sleep').click(); assert.equal(await page.locator('#subview-sleep').isVisible(), true);
      console.log('PASS: ' + entry + ' migration, dashboard, shortcuts, set editing, units, last session, records and weekly review');

      // A full backup must contain bytes and restore usable photos on a fresh origin store.
      await page.evaluate(pixel => {
        const key = 'ghostyGainsData_v4', s = JSON.parse(localStorage.getItem(key));
        s.progressPhotos = [{ id: 'pp_123', date: s.lastActiveDate, pose: 'front', photoUri: pixel, markedUri: pixel, ok: true, metrics: {}, warnings: [] }];
        localStorage.setItem(key, JSON.stringify(s));
      }, pixel);
      await page.reload(); await page.locator('#nav-profile').click(); await page.locator('#subtab-supps').click();
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export-full').click()]);
      const archive = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
      assert.equal(archive.format, 'ghosty-gains-full'); assert.equal(archive.photos[0].original, pixel); assert.equal(archive.photos[0].marked, pixel);
      const restore = await context.newPage(); restore.on('pageerror', e => errors.push(e.message)); restore.on('dialog', d => d.accept());
      await restore.goto(origin + entry);
      await restore.locator('#nav-profile').click(); await restore.locator('#subtab-supps').click();
      async function importFile(contents) {
        const [chooser] = await Promise.all([restore.waitForEvent('filechooser'), restore.locator('#btn-import-data').click()]);
        await chooser.setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(contents)) });
      }
      await importFile(archive);
      await restore.waitForFunction(() => document.getElementById('backup-status').textContent.startsWith('Restored all data'));
      let restored = await restore.evaluate(() => JSON.parse(localStorage.getItem('ghostyGainsData_v4')));
      assert.ok(restored.progressPhotos[0].photoUri.startsWith('idb:'));
      assert.equal(restored.workoutSets.length, archive.state.workoutSets.length);
      await restore.locator('#subtab-progress').click();
      await restore.waitForFunction(() => document.querySelector('.progress-thumb img')?.naturalWidth > 0);
      await restore.reload(); await restore.locator('#nav-profile').click(); await restore.locator('#subtab-progress').click();
      await restore.waitForFunction(() => document.querySelector('.progress-thumb img')?.naturalWidth > 0);
      await restore.locator('#subtab-supps').click();
      const [secondDownload] = await Promise.all([restore.waitForEvent('download'), restore.locator('#btn-export-full').click()]);
      assert.equal(JSON.parse(fs.readFileSync(await secondDownload.path(), 'utf8')).photos[0].original, pixel);
      const before = restored.progressPhotos[0].id;
      const broken = structuredClone(archive); broken.photos = [];
      await importFile(broken);
      await restore.waitForFunction(() => document.getElementById('backup-status').textContent.includes('missing a photo'));
      restored = await restore.evaluate(() => JSON.parse(localStorage.getItem('ghostyGainsData_v4')));
      assert.equal(restored.progressPhotos[0].id, before);
      const invalid = structuredClone(archive); invalid.photos[0].original = 'javascript:invalid';
      await importFile(invalid);
      await restore.waitForFunction(() => document.getElementById('backup-status').textContent.includes('invalid or oversized photo'));
      const corruptImage = structuredClone(archive); corruptImage.photos[0].original = 'data:image/png;base64,AAAA';
      await importFile(corruptImage);
      await restore.waitForFunction(() => document.getElementById('backup-status').textContent.includes('could not be decoded'));
      assert.equal(await restore.evaluate(() => JSON.parse(localStorage.getItem('ghostyGainsData_v4')).progressPhotos[0].id), before);
      console.log('PASS: full photo export, restore, reload, re-export and invalid backup protection');

      await restore.evaluate(() => {
        window.__photoFiles = {}; window.__photoRestores = 0; window.__photoDeletes = [];
        window.AndroidApp = {
          restoreProgressPhoto: (id, original, marked) => {
            window.__photoRestores++;
            if (window.__photoFailAfter && window.__photoRestores >= window.__photoFailAfter) return '{}';
            window.__photoFiles[id] = { original, marked };
            return JSON.stringify({ photoUri: original, markedUri: marked });
          },
          exportProgressPhoto: id => JSON.stringify(window.__photoFiles[id] || {}),
          deleteProgressPhoto: id => { window.__photoDeletes.push(id); delete window.__photoFiles[id]; },
          showToast: () => {}, vibrate: () => {}
        };
      });
      await importFile(archive);
      await restore.waitForFunction(() => document.getElementById('backup-status').textContent.startsWith('Restored all data'));
      assert.equal(await restore.evaluate(() => Object.keys(window.__photoFiles).length), 1);
      const [nativeDownload] = await Promise.all([restore.waitForEvent('download'), restore.locator('#btn-export-full').click()]);
      assert.equal(JSON.parse(fs.readFileSync(await nativeDownload.path(), 'utf8')).photos[0].original, pixel);
      const beforeNative = await restore.evaluate(() => JSON.parse(localStorage.getItem('ghostyGainsData_v4')).progressPhotos[0].id);
      const partial = structuredClone(archive);
      partial.state.progressPhotos.push({ ...partial.state.progressPhotos[0], id: 'pp_124' });
      partial.photos.push({ ...partial.photos[0], id: 'pp_124' });
      await restore.evaluate(() => { window.__photoRestores = 0; window.__photoFailAfter = 2; });
      await importFile(partial);
      await restore.waitForFunction(() => document.getElementById('backup-status').textContent.includes('could not be restored'));
      assert.equal(await restore.evaluate(() => JSON.parse(localStorage.getItem('ghostyGainsData_v4')).progressPhotos[0].id), beforeNative);
      assert.equal(await restore.evaluate(() => Object.keys(window.__photoFiles).length), 1);
      assert.ok(await restore.evaluate(() => window.__photoDeletes.length >= 1));
      console.log('PASS: native photo bridge export/restore and cleanup after a partial import failure');

      for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 900 }); await page.locator('#nav-today').click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        assert.equal(await page.locator('.bottom-nav svg').count(), 5);
        const meta = await page.locator('meta[name="viewport"]').getAttribute('content'); assert.ok(!meta.includes('user-scalable=no'));
        if (process.env.UI_SCREENSHOT_DIR) {
          fs.mkdirSync(process.env.UI_SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.UI_SCREENSHOT_DIR, `today-${width}.png`), fullPage: true, animations: 'disabled' });
        }
      }
      await context.close();
    }
    assert.deepEqual(errors, []); console.log('PASS: mobile/tablet layouts, zoom enabled, no browser exceptions');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
