/* Shared training history and review calculations. Dates are local calendar dates. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GhostyJournal = api;
})(typeof window === 'undefined' ? globalThis : window, function() {
  'use strict';
  const key = name => String(name || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  const positive = n => Number.isFinite(n) && n > 0;
  function target(text) {
    if (/\b(min|sec|second|meter|metre|km|mile|hold|amrap)\b/i.test(text)) return null;
    const match = String(text).match(/^(\d+)\s*[×x]\s*(\d+)(?:\s*[–—-]\s*(\d+))?(?:\s*reps)?\s*$/i);
    if (!match) return null;
    const [, count, low, high] = match;
    return +count > 0 && +count <= 20 && +low > 0 && +(high || low) >= +low
      ? { count: +count, low: +low, high: +(high || low) } : null;
  }
  function validSet(s) {
    return s && typeof s.exerciseKey === 'string' && typeof s.sessionId === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && Number.isFinite(s.weightKg) && s.weightKg >= 0 && s.weightKg <= 1000
      && Number.isInteger(s.reps) && s.reps > 0 && s.reps <= 1000
      && (s.rpe == null || (Number.isFinite(s.rpe) && s.rpe >= 1 && s.rpe <= 10));
  }
  function history(sets, exerciseKey, excludeSession) {
    const groups = new Map();
    sets.filter(s => validSet(s) && s.exerciseKey === exerciseKey && s.sessionId !== excludeSession).forEach(s => {
      if (!groups.has(s.sessionId)) groups.set(s.sessionId, []);
      groups.get(s.sessionId).push(s);
    });
    return [...groups.values()].map(rows => rows.sort((a, b) => a.setNumber - b.setNumber))
      .sort((a, b) => b[0].date.localeCompare(a[0].date) || (b[0].savedAt || 0) - (a[0].savedAt || 0));
  }
  function best(sets) {
    return sets.filter(validSet).reduce((record, s) => !record || s.weightKg > record.weightKg
      || (s.weightKg === record.weightKg && s.reps > record.reps) ? s : record, null);
  }
  function advice(rows, prescription) {
    if (!rows.length) return 'Log your first session to start tracking progress.';
    if (!prescription) return 'Compare the same exercise and technique across sessions.';
    if (rows.length < prescription.count) return 'Finish logging your working sets before deciding on an increase.';
    if (rows.some(s => s.rpe != null && s.rpe > 8)) return 'Keep the load steady and aim for controlled reps with more in reserve.';
    const sameLoad = rows.every(s => Math.abs(s.weightKg - rows[0].weightKg) < 0.001);
    if (sameLoad && rows.every(s => s.reps >= prescription.high)) {
      return rows[0].weightKg === 0
        ? 'Top of the rep range reached. Try a harder variation or a small added load when ready.'
        : 'Top of the rep range reached. Consider the smallest available weight increase next time, then return to the lower rep target.';
    }
    return `Keep the load steady and build towards ${prescription.high} controlled reps in each working set.`;
  }
  function previousDay(date, count) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() - count);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function weekly(state, today) {
    const start = previousDay(today, 6), previous = previousDay(start, 7);
    const within = row => row.date >= start && row.date <= today;
    const avg = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const sets = (state.workoutSets || []).filter(s => validSet(s) && within(s));
    const trainingDates = new Set([
      ...sets.map(s => s.date),
      ...(state.workoutLog || []).filter(within).map(s => s.date),
      ...(state.machineWorkouts || []).filter(within).map(s => s.date),
      ...(state.workoutSessions || []).filter(s => within(s) && s.finishedAt).map(s => s.date)
    ]);
    const meals = (state.mealLogs || []).filter(within);
    const proteinDays = new Map();
    meals.forEach(m => proteinDays.set(m.date, (proteinDays.get(m.date) || 0) + (Number(m.protein) || 0)));
    const steps = new Map((state.stepLogs || []).filter(within).map(s => [s.date, s.steps]));
    if (state.lastStepDate >= start && state.lastStepDate <= today && state.stepsToday > 0) steps.set(state.lastStepDate, state.stepsToday);
    const nights = (state.sleepLogs || []).filter(within).filter(s => positive(s.durationHours));
    const weights = (state.weightLogs || []).filter(s => positive(s.kg));
    const currentWeights = weights.filter(within), priorWeights = weights.filter(w => w.date >= previous && w.date < start);
    const weightAverage = avg(currentWeights.map(w => w.kg)), priorAverage = avg(priorWeights.map(w => w.kg));
    return { start, end: today, trainingDays: trainingDates.size, sets: sets.length,
      proteinAverage: avg([...proteinDays.values()]), proteinDays: proteinDays.size,
      stepsAverage: avg([...steps.values()]), stepDays: steps.size,
      sleepAverage: avg(nights.map(n => n.durationHours)), sleepDays: nights.length,
      weightAverage, weightDays: currentWeights.length,
      weightChange: weightAverage != null && priorAverage != null ? weightAverage - priorAverage : null };
  }
  return { key, target, validSet, history, best, advice, weekly };
});
