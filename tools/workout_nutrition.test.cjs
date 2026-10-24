const assert = require('node:assert/strict');
const { test } = require('node:test');
const logic = require('../app/src/main/assets/workout_nutrition.js');

test('RPE controls volume, effort and rest for every slider value', () => {
  let previous;
  for (let rpe = 1; rpe <= 10; rpe++) {
    const p = logic.prescription(rpe);
    assert.equal(p.rpe, rpe);
    assert.equal(p.rir, 10 - rpe);
    if (previous) {
      assert.ok(p.exercises <= previous.exercises);
      assert.ok(p.sets <= previous.sets);
      assert.ok(p.rest <= previous.rest);
    }
    previous = p;
  }
  assert.deepEqual([6, 7, 8, 9, 10].map(rpe => logic.prescription(rpe).exercises), [5, 4, 3, 3, 2]);
  assert.deepEqual([6, 8, 10].map(rpe => logic.prescription(rpe).sets), [4, 3, 2]);
  for (const style of Object.values(logic.styles)) assert.ok(style.rpe >= style.min && style.rpe <= style.max);
});

test('all twelve nutrients scale by exact grams and servings retain precision', () => {
  const food = Object.fromEntries(logic.nutrients.map(([key], index) => [key, (index + 1) * 10]));
  const { weight, totals } = logic.mealTotals([{ food, grams: 12.5 }, { food, grams: 37.5 }]);
  assert.equal(weight, 50);
  for (const [key] of logic.nutrients) assert.equal(totals[key], food[key] / 2);
  const per100 = Object.fromEntries(logic.nutrients.map(([key]) => [key, totals[key] * 100 / weight]));
  const serving = logic.scaleNutrition(per100, 7.25);
  for (const [key] of logic.nutrients) assert.ok(Math.abs(serving[key] - food[key] * 0.0725) < 1e-10);
});

test('unknown nutrients stay unknown, zero is valid, and salt converts to sodium mg', () => {
  assert.equal(logic.nutrientValue({ salt: 1 }, 'sodium'), 400);
  assert.equal(logic.nutrientValue({ sodium: 0, salt: 1 }, 'sodium'), 0);
  assert.equal(logic.nutrientValue({}, 'potassium'), null);
  const { totals } = logic.mealTotals([{ food: { protein: 10, fat: 0 }, grams: 100 }, { food: { protein: 20, fat: 0, potassium: 10 }, grams: 50 }]);
  assert.equal(totals.protein, 20);
  assert.equal(totals.fat, 0);
  assert.equal(totals.potassium, null);
});

test('ingredient lists have no fixed limit and invalid amounts do not corrupt previews', () => {
  const ingredients = Array.from({ length: 250 }, () => ({ grams: 0.5, food: { calories: 200 } }));
  ingredients.push({ grams: -10, food: { calories: 200 } }, { grams: 'invalid', food: {} });
  const { weight, totals } = logic.mealTotals(ingredients);
  assert.equal(weight, 125);
  assert.equal(totals.calories, 250);
});
