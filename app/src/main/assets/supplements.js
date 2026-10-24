/* Supplement choices and conditional guidance; usable by the browser and regression checks. */
(function (root) {
  'use strict';
  const catalog = [
    { id: 'vitd', name: 'Vitamin D3', desc: 'Supports bone and muscle health. UK guidance is to consider 10 micrograms daily in autumn and winter; some people need it year-round.' },
    { id: 'creatine', name: 'Creatine Monohydrate', desc: 'Can support strength and repeated high-intensity training. Benefits build with consistent use; it is not an instant energy boost.' },
    { id: 'whey', name: 'Protein Powder (Whey or Plant)', desc: 'A convenient way to meet your protein target when food falls short. Optional when your diet already provides enough protein.' },
    { id: 'omega3', name: 'Omega-3 / Fish Oil', desc: 'An option if you rarely eat oily fish; algae-based products are available. Food can cover this need.' },
    { id: 'multi', name: 'Multivitamin & Minerals', desc: 'May help with a restricted diet or identified gaps. Avoid combining products with overlapping high doses; it does not replace a varied diet.' },
    { id: 'beta_alanine', name: 'Beta-Alanine', desc: 'May help repeated hard efforts lasting roughly 1–4 minutes. Daily use over weeks matters; divided doses can reduce tingling. Less useful for short, heavy sets.' },
    { id: 'electrolytes', name: 'Electrolytes', desc: 'Can replace salts lost during prolonged, hot or very sweaty training. Water and normal meals are usually enough for shorter sessions.' }
  ];

  function normalize(saved) {
    const previous = new Map();
    for (const entry of Array.isArray(saved) ? saved : []) {
      if (entry && typeof entry.id === 'string' && !previous.has(entry.id)) previous.set(entry.id, entry);
    }
    const merge = (entry, old = {}) => {
      const selected = typeof old.selected === 'boolean' ? old.selected : old.checked === true;
      return { ...entry, selected, checked: selected && old.checked === true };
    };
    const result = catalog.map(entry => merge(entry, previous.get(entry.id)));
    // Preserve custom entries from backups while updating guidance for built-in products.
    for (const [id, entry] of previous) {
      if (!catalog.some(item => item.id === id) && typeof entry.name === 'string') {
        result.push(merge({ id, name: entry.name, desc: typeof entry.desc === 'string' ? entry.desc : '' }, entry));
      }
    }
    return result;
  }

  function suggestions({ goal = 'bodybuilding', style = 'bodybuilding', rpe = 6, profile = {}, month = new Date().getMonth() } = {}) {
    const conditions = profile.health?.conditions || [];
    const age = Number(profile.age);
    const review = !Number.isFinite(age) || age < 18 || conditions.includes('pregnancy');
    if (review) {
      const reason = conditions.includes('pregnancy')
        ? 'Your profile lists pregnancy/postpartum. Review supplements with your midwife, GP or pharmacist before starting; exercise goals alone cannot determine what is suitable.'
        : age > 0 && age < 18
          ? 'Your profile is under 18. Discuss supplements with a parent or guardian and a qualified healthcare professional; adult training guidance does not apply automatically.'
          : 'Enter your adult age in Goals before using plan-based supplement suggestions.';
      return catalog.map(entry => ({ id: entry.id, level: 'Check first', reason }));
    }
    const strength = style === 'strength' || goal === 'strongman';
    const resistance = strength || style === 'bodybuilding' || ['bodybuilding', 'pure_bodybuilder', 'gainz'].includes(goal);
    const conditioning = ['fatloss', 'get_fit'].includes(goal);
    const hardRepeatedEfforts = !strength && Number(rpe) >= 7 && (conditioning || style === 'bodybuilding');
    const target = Number(profile.proteinTarget);
    const protein = Number.isFinite(target) && target > 0 ? `your protein target of ${Math.round(target)} g/day` : 'your protein target';
    const winter = month >= 9 || month <= 2;
    return [
      { id: 'creatine', level: resistance ? 'Consider' : 'If needed', reason: resistance
        ? `Your ${strength ? 'strength' : 'muscle-building'} plan uses resistance training. Creatine can support strength and training performance; it is optional.`
        : 'Can help repeated high-intensity work, but regular training, food and sleep are the priorities for general fitness.' },
      { id: 'whey', level: 'If needed', reason: `Use only if meals do not cover ${protein}. Whey and plant protein are convenient options; food counts just as much.` },
      { id: 'beta_alanine', level: hardRepeatedEfforts ? 'If needed' : 'Lower priority', reason: hardRepeatedEfforts
        ? 'Your plan includes higher-effort work. Consider only if sessions include repeated hard efforts of about 1–4 minutes; RPE alone does not make it necessary.'
        : strength ? 'Short, heavy sets are not where beta-alanine is most useful. It is usually a lower priority for a strength plan.'
          : 'Usually a lower priority for moderate sessions. Its main use is repeated hard efforts lasting about 1–4 minutes, rather than everyday activity.' },
      { id: 'electrolytes', level: conditions.includes('heart') ? 'Check first' : 'If needed', reason: conditions.includes('heart')
        ? 'Your profile lists a heart condition or high blood pressure. Ask your clinician about suitable sodium, potassium and fluid intake before adding electrolyte products.'
        : `${conditioning ? 'For your conditioning sessions, consider' : 'Consider'} only for prolonged training, hot conditions or heavy sweating. A short gym session usually needs water and normal meals.` },
      { id: 'vitd', level: winter ? 'Consider' : 'If needed', reason: winter
        ? 'UK autumn/winter guidance is to consider 10 micrograms daily. This supports general health across all training plans.'
        : 'UK year-round guidance applies to some people with little sun exposure or other risk factors. Your workout goal does not establish a deficiency.' },
      { id: 'omega3', level: 'If needed', reason: 'Consider if you rarely eat oily fish. The app does not know your usual fish intake, so this is conditional rather than a plan requirement.' },
      { id: 'multi', level: 'Lower priority', reason: 'No training goal automatically requires a multivitamin. Consider specific dietary gaps with a professional rather than taking overlapping products.' }
    ];
  }

  const api = { catalog, normalize, suggestions };
  root.GhostySupplements = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
