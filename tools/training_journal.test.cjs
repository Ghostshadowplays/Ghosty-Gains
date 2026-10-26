const test = require('node:test');
const assert = require('node:assert/strict');
const journal = require('../app/src/main/assets/training_journal.js');
const set = (changes = {}) => ({ date: '2026-10-26', sessionId: 's1', exerciseKey: 'bench', weightKg: 50, reps: 12, rpe: null, setNumber: 1, ...changes });

test('rep targets exclude time, distance and mixed prescriptions', () => {
  assert.deepEqual(journal.target('3 × 8–12'), { count: 3, low: 8, high: 12 });
  assert.deepEqual(journal.target('2 x 10'), { count: 2, low: 10, high: 10 });
  for (const input of ['1 × 20 min', '4 × 30–40 meters', '3 × 10 (10s hold)', '3 × AMRAP', '0 × 5', '3 × 12–8']) assert.equal(journal.target(input), null, input);
});
test('bodyweight and optional RPE are valid; invalid loads and reps are rejected', () => {
  assert.ok(journal.validSet(set({ weightKg: 0 })));
  assert.ok(journal.validSet(set({ rpe: 8.5 })));
  for (const changes of [{ weightKg: -1 }, { weightKg: Infinity }, { reps: 0 }, { reps: 1.5 }, { rpe: 11 }, { rpe: NaN }]) assert.equal(journal.validSet(set(changes)), false);
});
test('history separates sessions, orders sets and excludes the current workout', () => {
  const rows = [set({ sessionId: 'old', date: '2026-10-20', setNumber: 2 }), set({ sessionId: 'old', date: '2026-10-20' }), set(), set({ exerciseKey: 'squat' })];
  const history = journal.history(rows, 'bench', 's1');
  assert.equal(history.length, 1); assert.deepEqual(history[0].map(s => s.setNumber), [1, 2]);
  assert.equal(rows[0].setNumber, 2, 'the saved array is not reordered');
});
test('records compare maximum load then reps at that load', () => {
  const result = journal.best([set({ weightKg: 40, reps: 20 }), set({ reps: 8 }), set({ reps: 10 })]);
  assert.equal(result.weightKg, 50); assert.equal(result.reps, 10);
});
test('progression requires all prescribed sets and respects reported effort', () => {
  const p = journal.target('2 × 8–12');
  assert.match(journal.advice([set()], p), /Finish logging/);
  assert.match(journal.advice([set(), set({ setNumber: 2 })], p), /smallest available weight increase/);
  assert.match(journal.advice([set({ rpe: 9 }), set()], p), /Keep the load steady/);
  assert.match(journal.advice([set({ reps: 10 }), set()], p), /build towards 12/);
  assert.match(journal.advice([set({ weightKg: 0 }), set({ weightKg: 0 })], p), /harder variation/);
  assert.match(journal.advice([set({ weightKg: 45 }), set()], p), /Keep the load steady/);
});
test('weekly review deduplicates training days, excludes planned food and compares weight averages', () => {
  const report = journal.weekly({ workoutSets: [set(), set({ date: '2026-10-01' })], workoutLog: [{ date: '2026-10-26' }, { date: '2026-10-25' }],
    mealLogs: [{ date: '2026-10-26', protein: 20 }, { date: '2026-10-26', protein: 30 }, { date: '2026-10-25', protein: 100 }],
    mealPlans: [{ date: '2026-10-26', protein: 900 }], stepLogs: [{ date: '2026-10-25', steps: 1000 }], lastStepDate: '2026-10-26', stepsToday: 3000,
    sleepLogs: [{ date: '2026-10-25', durationHours: 8 }], weightLogs: [{ date: '2026-10-21', kg: 80 }, { date: '2026-10-26', kg: 82 }, { date: '2026-10-15', kg: 79 }] }, '2026-10-26');
  assert.equal(report.start, '2026-10-20'); assert.equal(report.trainingDays, 2); assert.equal(report.sets, 1);
  assert.equal(report.proteinAverage, 75); assert.equal(report.proteinDays, 2);
  assert.equal(report.stepsAverage, 2000); assert.equal(report.sleepAverage, 8);
  assert.equal(report.weightAverage, 81); assert.equal(report.weightChange, 2);
  const empty = journal.weekly({}, '2026-01-02');
  assert.equal(empty.start, '2025-12-27'); assert.equal(empty.weightChange, null); assert.equal(empty.proteinAverage, null);
});
