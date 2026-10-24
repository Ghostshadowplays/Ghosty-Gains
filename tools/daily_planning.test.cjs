const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validDate, shiftDate, copyMealPlans, parseMachineDisplay, validateMachineMetrics } = require('../app/src/main/assets/daily_planning.js');

test('calendar navigation validates dates and crosses DST and year boundaries', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(shiftDate('2026-10-24', 2), '2026-10-26');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
});

test('meal prep creates independent planned copies with exact nutrition and ingredients', () => {
  let id = 0;
  const original = { id: 'old', date: '2026-10-20', name: 'Recipe', calories: 123.45, ingredients: [{ grams: 12.5 }] };
  const plans = copyMealPlans([original], '2026-10-25', 7, '2026-10-24', () => 'new_' + id++);
  assert.equal(plans.length, 7);
  assert.equal(new Set(plans.map(entry => entry.id)).size, 7);
  assert.equal(plans[6].date, '2026-10-31');
  assert.equal(plans[0].calories, 123.45);
  assert.equal(plans.every(entry => entry.planned), true);
  plans[0].ingredients[0].grams = 50;
  assert.equal(original.ingredients[0].grams, 12.5);
  assert.equal(plans[1].ingredients[0].grams, 12.5);
  assert.throws(() => copyMealPlans([original], '2026-10-20', 7, '2026-10-24', () => 'x'));
  assert.throws(() => copyMealPlans([], '2026-10-25', 7, '2026-10-24', () => 'x'));
});

test('machine reading finds labelled values and duration', () => {
  assert.deepEqual(parseMachineDisplay('TREADMILL\nSTEPS 4,210\nCALORIES 220\nDISTANCE 3.20 KM\nTIME 25:30'), { steps: 4210, calories: 220, distanceKm: 3.2, minutes: 25.5 });
  assert.deepEqual(parseMachineDisplay('Steps\n1234\nCalories\n150\nDistance\n2.5 km\nTime\n00:30:00'), { steps: 1234, calories: 150, distanceKm: 2.5, minutes: 30 });
  assert.deepEqual(parseMachineDisplay('1234\nSteps\n150\nCalories\n2.5 km\nDistance\n30:00\nTime'), { steps: 1234, calories: 150, distanceKm: 2.5, minutes: 30 });
});

test('unit conversions preserve miles, kJ and decimal minutes correctly', () => {
  const metrics = parseMachineDisplay('Distance 2 miles\nEnergy kJ 418.4\nDuration 1.5 hours');
  assert.equal(metrics.distanceKm, 3.218688);
  assert.ok(Math.abs(metrics.calories - 100) < 1e-9);
  assert.equal(metrics.minutes, 90);
  assert.equal(metrics.steps, null);
});

test('unreadable screens do not invent data and metric validation rejects bad readings', () => {
  assert.deepEqual(parseMachineDisplay('Welcome! Press start'), { steps: null, calories: null, distanceKm: null, minutes: null });
  assert.throws(() => validateMachineMetrics({ steps: '-1' }));
  assert.throws(() => validateMachineMetrics({ steps: '1.5' }));
  assert.throws(() => validateMachineMetrics({ minutes: '2000' }));
  assert.throws(() => validateMachineMetrics({ calories: '' }));
  assert.deepEqual(validateMachineMetrics({ calories: '200', steps: '', minutes: '25.5' }), { steps: null, calories: 200, distanceKm: null, minutes: 25.5 });
});

test('speed, remaining time and goals do not become completed activity', () => {
  assert.equal(parseMachineDisplay('SPEED\n10\nTIME\n20:30').minutes, 20.5);
  assert.equal(parseMachineDisplay('Time Remaining 10:00\nGoal Steps 5000').minutes, null);
  assert.equal(parseMachineDisplay('Time Remaining 10:00\nGoal Steps 5000').steps, null);
  assert.equal(parseMachineDisplay('Distance (m) 1500').distanceKm, 1.5);
  assert.deepEqual(parseMachineDisplay('Time 20:30 Calories 120\nSteps 1500 Distance 1.25 km'), { steps: 1500, calories: 120, distanceKm: 1.25, minutes: 20.5 });
});
