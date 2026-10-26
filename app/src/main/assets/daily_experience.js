/* Daily dashboard and set logging, using the app's existing navigation and saved state. */
window.GhostyExperience = function(app) {
  'use strict';
  const $ = id => document.getElementById(id), journal = window.GhostyJournal, photos = window.GhostyPhotos;
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const state = app.getState;
  const round = value => Number(value.toFixed(2));
  let refreshTimer, editor, busy = false;
  const icons = {
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    workouts: '<path d="m6 6 12 12M3 8l5-5m8 18 5-5M2 5l3-3m14 20 3-3M4 10l6-6m4 16 6-6"/>',
    nutrition: '<path d="M5 3v7m3-7v7M3 3v5c0 4 7 4 7 0V3M6.5 11v10M19 3c-5 3-5 10 0 10V3Zm0 10v8"/>',
    activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
    profile: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'
  };
  function routine() { return state().routines[state().activeRoutineId] || state().routines.bodybuilding; }
  function todayDay() { return routine().days[app.todayIndex(routine())]; }
  function selectedDay() {
    const filter = app.getDayFilter();
    return filter === 'all' || filter === 'today' ? todayDay() : routine().days[Number(filter)] || todayDay();
  }
  function sessionFor(day) {
    return state().workoutSessions.find(s => s.date === app.today() && s.dayId === day.id && s.routineId === state().activeRoutineId);
  }
  function ensureSession(day) {
    let session = sessionFor(day);
    if (!session) {
      session = { id: 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), date: app.today(),
        routineId: state().activeRoutineId, dayId: day.id, title: day.title, startedAt: Date.now() };
      state().workoutSessions.push(session);
      app.save();
    }
    return session;
  }
  function setsText(rows, unit = state().journalUnit || 'kg') {
    return rows.map(s => `${round(unit === 'lb' ? s.weightKg / .45359237 : s.weightKg)} ${unit} × ${s.reps}${s.rpe != null ? ` @ ${s.rpe}` : ''}`).join(' · ');
  }
  function startWorkout(day = selectedDay()) {
    app.navigate('workouts', 'subview-plan');
    if (day.isRest) {
      app.setDayFilter('today'); app.renderWorkouts();
      app.toast('Recovery day. Choose a training day from your plan if you want to train.'); return;
    }
    const index = routine().days.indexOf(day);
    app.setDayFilter(index);
    const session = ensureSession(day);
    delete session.finishedAt;
    app.save(); app.renderWorkouts();
    document.querySelector('.day-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderWorkoutHeader() {
    const day = selectedDay(), session = day && sessionFor(day);
    if (!day) return;
    $('btn-start-workout').textContent = day.isRest ? 'View Recovery Plan' : session?.finishedAt ? 'Reopen Workout' : session ? 'Resume Workout' : 'Start Workout';
    $('btn-finish-workout').hidden = !session || !!session.finishedAt;
    const count = session ? state().workoutSets.filter(s => s.sessionId === session.id).length : 0;
    $('workout-session-status').textContent = session ? `${count} working sets saved today${session.finishedAt ? ' · Workout finished' : ' · Session in progress'}` : day.isRest ? 'Recovery supports your next training session.' : 'Save each working set to track your progress over time.';
  }
  function decorateExercise({ day, ex, view, item }) {
    if (day.isRest || !journal.target(view.sets)) return;
    const key = journal.key(view.name), session = sessionFor(day);
    const previous = journal.history(state().workoutSets, key, session?.id)[0] || [];
    const current = session ? state().workoutSets.filter(s => s.sessionId === session.id && s.exerciseKey === key) : [];
    const wrap = document.createElement('div'); wrap.className = 'exercise-journal';
    const button = document.createElement('button'); button.className = 'btn btn-outline btn-sm btn-log-sets';
    button.textContent = current.length ? `Edit ${current.length} Saved Sets` : 'Log Sets';
    button.setAttribute('aria-label', `Log sets for ${view.name}`);
    button.onclick = () => openSetLog(day, ex, view);
    const last = document.createElement('p'); last.textContent = previous.length ? `Last time · ${setsText(previous)}` : 'Your first set starts your history.';
    const record = journal.best(state().workoutSets.filter(s => s.exerciseKey === key));
    wrap.append(button, last);
    if (record) { const pr = document.createElement('p'); pr.className = 'record'; pr.textContent = `Best set · ${setsText([record])}`; wrap.append(pr); }
    const advice = document.createElement('p'); advice.textContent = journal.advice(current.length ? current : previous, journal.target(view.sets)); wrap.append(advice);
    item.append(wrap);
  }
  function appendSet(data = {}, previous = {}) {
    const row = document.createElement('div'); row.className = 'set-row';
    const number = $('set-log-rows').children.length + 1;
    const unit = $('set-weight-unit').value;
    const weight = value => value == null ? '' : round(unit === 'lb' ? value / .45359237 : value);
    row.innerHTML = `<span>${number}</span><input aria-label="Set ${number} weight in ${unit}" type="number" min="0" max="${unit === 'lb' ? 2204 : 1000}" step="any" inputmode="decimal" data-field="weight" placeholder="${weight(previous.weightKg)}" value="${weight(data.weightKg)}"><input aria-label="Set ${number} reps" type="number" min="1" max="1000" step="1" inputmode="numeric" data-field="reps" placeholder="${previous.reps || ''}" value="${data.reps || ''}"><input aria-label="Set ${number} RPE (optional)" type="number" min="1" max="10" step="0.5" inputmode="decimal" data-field="rpe" placeholder="—" value="${data.rpe ?? ''}"><button class="btn btn-outline" type="button" aria-label="Remove set ${number}">×</button>`;
    row.querySelector('button').onclick = () => {
      row.remove(); renumberSets();
    };
    $('set-log-rows').append(row);
  }
  function renumberSets() {
    [...$('set-log-rows').children].forEach((row, i) => {
      row.firstElementChild.textContent = i + 1;
      row.querySelectorAll('input').forEach(input => input.setAttribute('aria-label', `Set ${i + 1} ${input.dataset.field}${input.dataset.field === 'weight' ? ' in ' + $('set-weight-unit').value : ''}`));
      row.querySelector('button').setAttribute('aria-label', `Remove set ${i + 1}`);
    });
  }
  function openSetLog(day, ex, view) {
    const key = journal.key(view.name), session = sessionFor(day);
    const current = session ? state().workoutSets.filter(s => s.sessionId === session.id && s.exerciseKey === key).sort((a, b) => a.setNumber - b.setNumber) : [];
    const history = journal.history(state().workoutSets, key, session?.id);
    editor = { day, ex, view, key, previous: history[0] || [], date: app.today() };
    $('set-log-title').textContent = view.name;
    $('set-log-target').textContent = `Today · ${view.sets} · ${day.title}`;
    $('set-log-previous').textContent = editor.previous.length ? `Last time (${editor.previous[0].date}) · ${setsText(editor.previous)}` : 'No previous session yet. Blank sets are not saved.';
    $('set-log-progress').textContent = journal.advice(editor.previous, journal.target(view.sets));
    $('set-log-error').textContent = '';
    $('set-weight-unit').value = state().journalUnit || 'kg';
    $('set-log-rows').replaceChildren();
    const count = Math.max(journal.target(view.sets).count, ...current.map(s => s.setNumber), 0);
    for (let i = 0; i < count; i++) appendSet(current.find(s => s.setNumber === i + 1), editor.previous[i]);
    $('btn-use-last-sets').disabled = !editor.previous.length;
    const record = journal.best(state().workoutSets.filter(s => s.exerciseKey === key));
    $('set-log-history').innerHTML = `${record ? `<p class="report-text">Best set · ${esc(setsText([record]))}</p>` : ''}${history.slice(0, 30).map(rows => `<div class="training-history-row"><strong>${esc(rows[0].date)}</strong><p>${esc(setsText(rows))}</p></div>`).join('') || '<p class="report-text">Saved sessions will appear here.</p>'}`;
    app.openModal('modal-set-log');
  }
  function saveSets(event) {
    event.preventDefault();
    if (!editor || editor.date !== app.today()) { $('set-log-error').textContent = 'The date has changed. Reopen this exercise to log today’s sets.'; return; }
    const unit = $('set-weight-unit').value, rows = [], inputs = [...$('set-log-rows').children];
    for (let i = 0; i < inputs.length; i++) {
      const values = Object.fromEntries([...inputs[i].querySelectorAll('input')].map(input => [input.dataset.field, input.value.trim()]));
      if (Object.values(values).every(v => v === '')) continue;
      const row = { weightKg: unit === 'lb' ? Number(values.weight) * .45359237 : Number(values.weight), reps: Number(values.reps), rpe: values.rpe === '' ? null : Number(values.rpe),
        exerciseKey: editor.key, sessionId: 'pending', date: app.today(), setNumber: i + 1 };
      if (values.weight === '' || !journal.validSet(row)) { $('set-log-error').textContent = `Set ${i + 1}: enter weight (0 for bodyweight), whole reps, and an optional RPE from 1–10.`; return; }
      rows.push(row);
    }
    if (!rows.length && !sessionFor(editor.day)) { $('set-log-error').textContent = 'Enter at least one working set.'; return; }
    const session = ensureSession(editor.day);
    const old = state().workoutSets.filter(s => s.sessionId === session.id && s.exerciseKey === editor.key);
    if (!rows.length && old.length && !confirm('Remove all saved sets for this exercise today?')) return;
    const prior = journal.best(state().workoutSets.filter(s => s.exerciseKey === editor.key && s.sessionId !== session.id));
    const saved = rows.map(row => ({ ...row, sessionId: session.id, exerciseName: editor.view.name, exId: editor.ex.id, savedAt: Date.now() }));
    const remaining = state().workoutSets.filter(s => !(s.sessionId === session.id && s.exerciseKey === editor.key));
    state().workoutSets = [...remaining, ...saved]; state().journalUnit = unit;
    app.save(); app.closeModal('modal-set-log'); app.renderWorkouts(); refresh();
    const record = journal.best(saved);
    app.toast(record && prior && (record.weightKg > prior.weightKg || (record.weightKg === prior.weightKg && record.reps > prior.reps)) ? 'New personal best! Sets saved.' : `${saved.length} working sets saved.`);
  }
  function metric(label, value, caption, current, goal, tab, subview) {
    const button = document.createElement('button'); button.className = 'today-metric';
    button.innerHTML = `<span class="metric-label">${esc(label)}</span><span class="metric-value">${esc(value)}</span><span class="metric-caption">${esc(caption)}</span><progress max="${goal || 1}" value="${Math.max(0, Math.min(current, goal || 1))}" aria-label="${esc(label)} progress"></progress>`;
    button.onclick = () => { if (tab === 'nutrition') app.selectNutritionToday(); app.navigate(tab, subview); };
    return button;
  }
  function refresh() {
    if (!$('today-metrics')) return;
    const s = state(), day = todayDay(), today = app.today(), session = sessionFor(day);
    const meals = (s.mealLogs || []).filter(m => m.date === today);
    const calories = meals.reduce((n, m) => n + (Number(m.calories) || 0), 0), protein = meals.reduce((n, m) => n + (Number(m.protein) || 0), 0);
    const water = (s.waterLogs || []).filter(w => w.date === today).reduce((n, w) => n + w.ml, 0);
    const sets = s.workoutSets.filter(row => row.date === today);
    $('today-date').textContent = new Date(today + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    $('today-workout-title').textContent = day.title;
    const completed = new Set([...(s.workoutLog || []).filter(row => row.date === today).map(row => row.exId), ...sets.map(row => row.exId)]).size;
    $('today-workout-summary').textContent = day.isRest ? 'Recovery day · keep moving gently, eat well and rest.' : `${completed} exercise${completed === 1 ? '' : 's'} logged today · ${sets.length} working sets · RPE ${s.trainingRpe}`;
    $('btn-today-start').textContent = day.isRest ? 'View Recovery Plan' : session?.finishedAt ? 'Review Workout' : session ? 'Resume Workout' : 'Start Workout';
    const kg = app.toKg(s.profile.weight, s.profile.unit), waterTarget = Math.round(kg * 35 / 50) * 50;
    $('today-metrics').replaceChildren(
      metric('Calories', Math.round(calories).toLocaleString('en-GB'), `of ${s.profile.calorieTarget} kcal`, calories, s.profile.calorieTarget, 'nutrition'),
      metric('Protein', `${Math.round(protein)} g`, `of ${s.profile.proteinTarget} g`, protein, s.profile.proteinTarget, 'nutrition'),
      metric('Water', `${water.toLocaleString('en-GB')} ml`, `of ${waterTarget.toLocaleString('en-GB')} ml`, water, waterTarget, 'nutrition'),
      metric('Steps', (s.lastStepDate === today ? s.stepsToday : 0).toLocaleString('en-GB'), `of ${s.stepGoal.toLocaleString('en-GB')}`, s.lastStepDate === today ? s.stepsToday : 0, s.stepGoal, 'activity', 'subview-steps')
    );
    const review = journal.weekly(s, today);
    $('weekly-date-range').textContent = `${review.start} – ${review.end}`;
    const average = (value, suffix) => value == null ? 'No logs yet' : round(value) + suffix;
    const reviewRows = [
      ['Training', `${review.trainingDays} / 7 days`, `${review.sets} working sets logged`],
      ['Protein', average(review.proteinAverage, ' g'), `${review.proteinDays} food days logged`],
      ['Steps', average(review.stepsAverage == null ? null : Math.round(review.stepsAverage), ''), `${review.stepDays} days logged`],
      ['Sleep', average(review.sleepAverage, ' h'), `${review.sleepDays} nights logged`],
      ['Average weight', average(review.weightAverage, ' kg'), `${review.weightDays} weigh-ins`],
      ['Weight change', review.weightChange == null ? 'More logs needed' : `${review.weightChange > 0 ? '+' : ''}${round(review.weightChange)} kg`, 'versus previous 7-day average']
    ];
    $('weekly-review').innerHTML = reviewRows.map(([label, value, note]) => `<div class="review-item"><span>${esc(label)}</span><strong>${esc(value)}</strong><span>${esc(note)}</span></div>`).join('');
    $('recent-training').replaceChildren();
    [...s.workoutSessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 8).forEach(session => {
      const rows = s.workoutSets.filter(row => row.sessionId === session.id);
      const block = document.createElement('details'); block.className = 'training-history-row';
      block.innerHTML = `<summary>${esc(session.date)} · ${esc(session.title)}</summary><p>${rows.length} sets · ${session.finishedAt ? 'Finished' : 'In progress'}</p>`;
      [...new Set(rows.map(row => row.exerciseKey))].forEach(key => {
        const group = rows.filter(row => row.exerciseKey === key), p = document.createElement('p');
        p.textContent = `${group[0].exerciseName} · ${setsText(group)}`; block.append(p);
      });
      $('recent-training').append(block);
    });
    if (!s.workoutSessions.length) $('recent-training').innerHTML = '<p class="report-text">Start a workout and log your sets to build your training history. Your existing exercise completion history remains saved.</p>';
    renderWorkoutHeader();
  }
  function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 80); }
  async function download(filename, json) {
    if (window.AndroidApp?.saveTextFile) {
      if (!window.AndroidApp.saveTextFile(filename, json)) throw new Error('The backup could not be saved. Check available storage and try again.');
    } else {
      const uri = URL.createObjectURL(new Blob([json], { type: 'application/json' })), link = document.createElement('a');
      link.href = uri; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(uri), 60000);
    }
  }
  async function exportFull() {
    if (busy) return; busy = true; $('btn-export-full').disabled = true;
    try {
      const snapshot = JSON.parse(JSON.stringify(state())), images = [];
      for (const photo of snapshot.progressPhotos || []) {
        $('backup-status').textContent = `Preparing photo ${images.length + 1} of ${snapshot.progressPhotos.length}…`;
        images.push(await photos.exportPhoto(photo));
      }
      $('backup-status').textContent = 'Saving full backup…';
      await download(`ghosty_gains_full_${app.today()}.json`, JSON.stringify({ format: 'ghosty-gains-full', version: 1, createdAt: new Date().toISOString(), state: snapshot, photos: images }));
      $('backup-status').textContent = `Full backup saved with ${images.length} photos. Keep this file private.`;
    } catch (e) { $('backup-status').textContent = e.message; }
    finally { busy = false; $('btn-export-full').disabled = false; }
  }
  async function restoreBackup(text) {
    const oldPhotos = [...(state().progressPhotos || [])];
    const backup = JSON.parse(text), full = backup.format === 'ghosty-gains-full';
    if (full && (backup.version !== 1 || !Array.isArray(backup.photos))) throw new Error('This full backup version is not supported.');
    const candidate = full ? backup.state : backup;
    if (!candidate || typeof candidate.profile !== 'object' || !candidate.profile || Array.isArray(candidate.profile)) throw new Error('That file is not a Ghosty Gains backup.');
    const normalized = app.normalize(candidate);
    const existing = new Map((full ? backup.photos : []).map(p => [p.id, p]));
    if (full) for (const p of normalized.progressPhotos) {
      const image = existing.get(p.id);
      if (!image) throw new Error('The full backup is missing a photo. Existing data has been kept.');
      photos.validate(image.original); if (image.marked) photos.validate(image.marked);
      if (p.markedUri && !image.marked) throw new Error('The full backup is missing a marked photo.');
    }
    const created = [];
    try {
      if (full) for (const p of normalized.progressPhotos) {
        const image = existing.get(p.id), id = 'pp_' + (Date.now() * 1000 + created.length);
        const restored = { ...p, id, photoUri: '', markedUri: '' };
        created.push(restored);
        Object.assign(restored, await photos.restore(image, id));
      }
      if (full) normalized.progressPhotos = created;
      await app.replaceState(normalized);
      await photos.hydrate(normalized.progressPhotos);
      if (full) await Promise.allSettled(oldPhotos.map(p => photos.remove(p)));
      app.renderProgress(); refresh();
      $('backup-status').textContent = full ? `Restored all data and ${created.length} photos.` : 'Data restored. Use Full Backup to transfer photo files too.';
      app.toast('Backup restored.');
    } catch (error) {
      if (state() !== normalized) await Promise.allSettled(created.map(p => photos.remove(p)));
      throw error;
    }
  }
  function bind() {
    const plan = $('subview-plan');
    plan.prepend($('workout-plan-header'));
    $('workout-days-container').after($('workout-settings'), document.querySelector('.rest-timer-bar'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach(button => {
      const icon = button.querySelector('.nav-icon');
      icon.setAttribute('aria-hidden', 'true'); icon.innerHTML = `<svg viewBox="0 0 24 24">${icons[button.dataset.tab === 'today' ? 'home' : button.dataset.tab]}</svg>`;
    });
    $('btn-today-start').onclick = () => startWorkout(todayDay());
    $('btn-start-workout').onclick = () => startWorkout();
    $('btn-finish-workout').onclick = () => {
      const session = sessionFor(selectedDay()); if (!session) return;
      if (!state().workoutSets.some(s => s.sessionId === session.id) && !confirm('Finish this workout without any saved sets?')) return;
      session.finishedAt = Date.now(); app.save(); renderWorkoutHeader(); refresh(); app.toast('Workout finished. Your sets are saved.');
    };
    $('btn-today-food').onclick = () => { app.selectNutritionToday(); app.navigate('nutrition'); app.openModal('modal-food-actions'); };
    $('btn-today-water').onclick = () => {
      state().waterLogs.push({ id: 'w_' + Date.now(), date: app.today(), ml: 250 }); app.save(); app.renderNutrition(); refresh(); app.toast('250 ml water logged.');
    };
    $('btn-today-weight').onclick = () => { app.navigate('profile', 'subview-weight'); $('log-weight-input').focus(); };
    $('btn-today-sleep').onclick = () => app.navigate('activity', 'subview-sleep');
    $('btn-add-food').onclick = () => app.openModal('modal-food-actions');
    document.querySelectorAll('#modal-food-actions button:not(.modal-close)').forEach(button => button.addEventListener('click', () => app.closeModal('modal-food-actions')));
    $('btn-add-set').onclick = () => { if ($('set-log-rows').children.length < 20) appendSet(); };
    $('btn-use-last-sets').onclick = () => { $('set-log-rows').replaceChildren(); editor.previous.forEach(row => appendSet(row)); };
    $('set-log-form').onsubmit = saveSets;
    $('set-weight-unit').onchange = () => {
      const next = $('set-weight-unit').value, old = editor.unit || state().journalUnit || 'kg';
      $('set-log-rows').querySelectorAll('[data-field="weight"]').forEach(input => {
        const convert = value => round(next === 'lb' ? value / .45359237 : value * .45359237);
        if (input.value !== '' && old !== next) input.value = convert(Number(input.value));
        if (input.placeholder !== '' && old !== next) input.placeholder = convert(Number(input.placeholder));
        input.max = next === 'lb' ? '2204' : '1000';
      });
      editor.unit = next; renumberSets();
    };
    $('btn-export-full').onclick = exportFull;
    $('btn-import-data').onclick = () => {
      if (busy) return;
      const input = document.createElement('input'); input.type = 'file'; input.setAttribute('aria-label', 'Select Ghosty Gains backup');
      input.onchange = async () => {
        const file = input.files[0]; if (!file) return;
        if (file.size > 180000000) { $('backup-status').textContent = 'This backup is too large to restore here.'; return; }
        if (!confirm('Restore this backup and replace the current logs and settings?')) return;
        busy = true; $('btn-import-data').disabled = true; $('backup-status').textContent = 'Restoring backup…';
        try { await restoreBackup(await file.text()); } catch (e) { $('backup-status').textContent = e instanceof SyntaxError ? 'Invalid backup JSON file.' : e.message; }
        finally { busy = false; $('btn-import-data').disabled = false; }
      };
      input.click();
    };
  }
  bind();
  return { decorateExercise, renderWorkoutHeader, refresh, scheduleRefresh, restoreBackup };
};
