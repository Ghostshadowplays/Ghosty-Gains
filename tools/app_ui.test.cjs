// Requires playwright-core and an installed Chromium browser. Set BROWSER_PATH if needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const logic = require('../app/src/main/assets/workout_nutrition.js');

(async () => {
  const server = http.createServer((request, response) => {
    const file = path.resolve(root, '.' + decodeURIComponent(request.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html');
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(origin + '/Ghostys_Bodybuilding_Return_Plan.html');
    await page.locator('#btn-ob-skip').click();
    await page.locator('#workout-day-filter-bar button').filter({ hasText: 'Full Week' }).click();
    for (let rpe = 1; rpe <= 10; rpe++) {
      await page.locator('#workout-rpe').evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, String(rpe));
      const p = logic.prescription(rpe);
      const days = await page.locator('.day-card:not(.rest-day)').evaluateAll(cards => cards.map(card => ({
        count: card.querySelectorAll('.exercise-item').length,
        sets: [...card.querySelectorAll('.exercise-target')].map(el => el.textContent),
        notes: [...card.querySelectorAll('.exercise-notes')].map(el => el.textContent)
      })));
      for (const day of days) {
        assert.equal(day.count, p.exercises, `RPE ${rpe} exercise count`);
        day.sets.forEach(sets => assert.ok(sets.startsWith(p.sets + ' ×'), sets));
        day.notes.forEach(notes => assert.ok(notes.includes(p.rir + ' reps in reserve'), notes));
      }
      assert.equal(await page.locator('#timer-display').textContent(), String(Math.floor(p.rest / 60)).padStart(2, '0') + ':' + String(p.rest % 60).padStart(2, '0'));
    }
    for (const [style, value] of Object.entries(logic.styles)) {
      await page.locator('#training-style').selectOption(style);
      assert.equal(await page.locator('#workout-rpe').inputValue(), String(value.rpe));
    }
    await page.reload();
    assert.equal(await page.locator('#training-style').inputValue(), 'strength');
    assert.equal(await page.locator('#workout-rpe').inputValue(), '8');
    for (const goal of ['fatloss', 'gainz', 'stay_same', 'get_fit', 'pure_bodybuilder', 'strongman', 'bodybuilding']) {
      await page.locator('#nav-profile').click();
      await page.locator(`.goal-pill[data-goal="${goal}"]`).click();
      await page.locator('#nav-workouts').click();
      await page.locator('#workout-day-filter-bar button').filter({ hasText: 'Full Week' }).click();
      for (const rpe of [6, 10]) {
        await page.locator('#workout-rpe').evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, String(rpe));
        const counts = await page.locator('.day-card:not(.rest-day)').evaluateAll(cards => cards.map(card => card.querySelectorAll('.exercise-item').length));
        counts.forEach(count => assert.equal(count, logic.prescription(rpe).exercises, `${goal} RPE ${rpe}`));
      }
    }
    console.log('PASS: all RPE values, presets, working sets, rest timer and persistence');

    await page.locator('#nav-nutrition').click();
    await page.locator('#btn-open-meal-builder').click();
    await page.locator('#meal-builder-name').fill('Regression Recipe');
    await page.locator('#btn-save-custom-meal').click();
    assert.ok(await page.locator('#modal-meal-builder').evaluate(el => el.classList.contains('active')));
    const values = [200, 20, 30, 10, 4, 5, 400, 20, 2, 7, 1, 300];
    async function fillIngredient(index, name, grams, factor) {
      const block = page.locator('.meal-ingredient').nth(index);
      await block.locator('.ingredient-name').fill(name);
      await block.locator('.ingredient-grams').fill(String(grams));
      await block.locator('summary').click();
      for (let i = 0; i < logic.nutrients.length; i++) await block.locator(`[data-nutrient="${logic.nutrients[i][0]}"]`).fill(String(values[i] * factor));
    }
    await fillIngredient(0, 'Ingredient A', 150, 1);
    await page.locator('#btn-add-meal-ingredient').click();
    await fillIngredient(1, 'Ingredient B', 50, 0.5);
    assert.equal(await page.locator('#meal-builder-weight').textContent(), '200g total');
    assert.ok((await page.locator('#meal-builder-totals').textContent()).includes('350 kcal'));
    // Gram edits and deleting/re-adding ingredients must recalculate immediately.
    await page.locator('.ingredient-grams').nth(1).fill('12.5');
    assert.equal(await page.locator('#meal-builder-weight').textContent(), '162.5g total');
    await page.locator('.ingredient-grams').nth(1).fill('50');
    await page.locator('#btn-add-meal-ingredient').click();
    await page.locator('.ingredient-delete').nth(2).click();
    assert.equal(await page.locator('.meal-ingredient').count(), 2);
    await page.locator('#btn-save-custom-meal').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ghostyGainsData_v4')).foodLibrary.find(f => f.name === 'Regression Recipe'));
    assert.equal(saved.totalWeight, 200);
    assert.equal(saved.ingredients.length, 2);
    logic.nutrients.forEach(([key], i) => assert.equal(saved.totals[key], values[i] * 1.75));
    await page.locator('.food-lib-item').filter({ hasText: 'Regression Recipe' }).click();
    await page.locator('#scanned-result-container select[aria-label="Unit"]').selectOption('g');
    await page.locator('#scanned-result-container input[type="number"]').fill('80');
    assert.ok((await page.locator('#scanned-result-container .nutrition-profile').textContent()).includes('280 mg'));
    await page.locator('#scanned-result-container button').filter({ hasText: 'Log to' }).click();
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem('ghostyGainsData_v4')).mealLogs[0]);
    assert.equal(log.grams, 80);
    assert.equal(log.calories, 140);
    assert.equal(log.protein, 14);
    assert.equal(log.sodium, 280);
    assert.equal(log.ingredients.length, 2);
    console.log('PASS: manual recipe, all twelve totals, exact gram edits, delete, save and scaled serving log');

    await page.locator('#btn-open-meal-builder').click();
    await page.locator('#meal-builder-name').fill('Scanned Recipe');
    await page.locator('.ingredient-scan').click();
    await page.locator('#manual-barcode-input').fill('5000111000456');
    await page.locator('#btn-lookup-barcode').click();
    await page.locator('#scanned-result-container button').filter({ hasText: 'Use This Ingredient' }).click();
    assert.equal(await page.locator('.ingredient-name').inputValue(), 'Pure Rolled Scottish Wholegrain Oats');
    assert.equal(await page.locator('#meal-builder-weight').textContent(), '100g total');
    assert.ok((await page.locator('#meal-builder-totals').textContent()).includes('375 kcal'));
    assert.ok((await page.locator('#meal-builder-totals').textContent()).includes('Unknown'));
    await page.locator('#btn-add-meal-ingredient').click();
    await fillIngredient(1, 'Manual addition', 50, 1);
    assert.equal(await page.locator('#meal-builder-weight').textContent(), '150g total');
    assert.ok((await page.locator('#meal-builder-totals').textContent()).includes('475 kcal'));
    await page.locator('#btn-save-custom-meal').click();
    await page.locator('#modal-food-library .modal-close').click();
    await page.reload();
    await page.locator('#nav-nutrition').click();
    await page.locator('#btn-open-food-library').click();
    assert.equal(await page.locator('.food-lib-item').filter({ hasText: 'Scanned Recipe' }).count(), 1);
    console.log('PASS: ingredient barcode lookup, unknown nutrient display and recipe persistence');
    await page.locator('#modal-food-library .modal-close').click();

    // Exercise the online nutrient conversion path with a deterministic product response.
    await context.route('https://world.openfoodfacts.org/api/v2/product/1234567890123.json', route => route.fulfill({
      json: { status: 1, product: { product_name: 'Test Milk', categories_tags: ['en:milks'], nutriments: {
        'energy-kcal_100g': 60, proteins_100g: 3, carbohydrates_100g: 5, fat_100g: 3,
        sugars_100g: 5, fiber_100g: 0, 'saturated-fat_100g': 2,
        sodium_100g: 0.04, cholesterol_100g: 0.01, potassium_100g: 0.15,
        'monounsaturated-fat_100g': 0.5, 'polyunsaturated-fat_100g': 0.2, 'trans-fat_100g': 0
      } } }
    }));
    await page.locator('#btn-open-meal-builder').click();
    await page.locator('#meal-builder-name').fill('Liquid Recipe');
    await page.locator('.ingredient-scan').click();
    await page.locator('#manual-barcode-input').fill('1234567890123');
    await page.locator('#btn-lookup-barcode').click();
    await page.locator('#ingredient-liquid-weight').fill('103');
    await page.locator('#scanned-result-container button').filter({ hasText: 'Use This Ingredient' }).click();
    await page.locator('.ingredient-grams').fill('103');
    await page.locator('#btn-save-custom-meal').click();
    const milk = await page.evaluate(() => JSON.parse(localStorage.getItem('ghostyGainsData_v4')).foodLibrary.find(f => f.name === 'Liquid Recipe'));
    for (const [key, expected] of Object.entries({ calories: 60, sodium: 40, cholesterol: 10, potassium: 150, unsatFat: 0.7, transFat: 0 })) {
      assert.ok(Math.abs(milk.totals[key] - expected) < 1e-9, `${key}: ${milk.totals[key]}`);
    }
    console.log('PASS: online nutrient units, liquid gram conversion and mixed scanned/manual ingredients');

    // Android bridge simulation verifies that the recovery control invokes native clearing.
    const nativePage = await context.newPage();
    nativePage.on('pageerror', error => errors.push(error.message));
    await nativePage.addInitScript(() => {
      window.__inVehicle = true;
      window.__cleared = false;
      window.AndroidApp = {
        hasStepSensor: () => true, getSensorType: () => 'Hardware Step Counter',
        hasActivityPermission: () => true, isStepsPaused: () => false,
        isInVehicle: () => window.__inVehicle, getTodayNativeSteps: () => 100,
        syncSteps: () => setTimeout(() => window.onNativeStepSync(100, 'ok', false)),
        clearVehicleDetection: () => { window.__inVehicle = false; window.__cleared = true; setTimeout(() => window.onNativeStepSync(100, 'ok', false)); },
        showToast: () => {}, vibrate: () => {}
      };
    });
    await nativePage.goto(origin + '/app/src/main/assets/index.html');
    await nativePage.locator('#nav-activity').click();
    await nativePage.locator('#btn-clear-vehicle').click();
    assert.equal(await nativePage.evaluate(() => window.__cleared), true);
    await nativePage.waitForFunction(() => document.getElementById('btn-clear-vehicle').style.display === 'none');
    assert.ok((await nativePage.locator('#pedometer-status-text').textContent()).includes('connected'));
    assert.deepEqual(errors, []);
    console.log('PASS: Android entry page and false-driving recovery control; no browser exceptions');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
