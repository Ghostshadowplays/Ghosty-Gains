const { test } = require('node:test');
const assert = require('node:assert/strict');
const { catalog, normalize, suggestions } = require('../app/src/main/assets/supplements.js');

test('old checklists gain new products and retain existing selections without selecting everything', () => {
  const previous = [{ id: 'creatine', name: 'Old label', checked: true }, { id: 'whey', checked: false },
    { id: 'custom', name: 'My prescribed supplement', desc: 'As directed', selected: true, checked: false }];
  const result = normalize(previous);
  assert.equal(result.length, catalog.length + 1);
  assert.deepEqual(result.find(s => s.id === 'creatine'), { ...catalog.find(s => s.id === 'creatine'), selected: true, checked: true });
  assert.equal(result.find(s => s.id === 'whey').selected, false);
  for (const id of ['beta_alanine', 'electrolytes']) assert.equal(result.find(s => s.id === id).selected, false);
  assert.equal(result.find(s => s.id === 'custom').desc, 'As directed');
  assert.equal(previous[0].name, 'Old label');
  assert.equal(normalize([{ id: 'creatine', selected: false, checked: true }])[1].checked, false);
  const fresh = normalize();
  fresh[0].selected = true;
  assert.equal(normalize().every(s => !s.selected && !s.checked), true);
});

test('plan suggestions distinguish strength and conditioning without making high RPE a supplement requirement', () => {
  const context = { profile: { age: 30, proteinTarget: 145 }, month: 9 };
  const strength = suggestions({ ...context, goal: 'strongman', style: 'strength', rpe: 9 });
  assert.equal(strength.find(s => s.id === 'creatine').level, 'Consider');
  assert.equal(strength.find(s => s.id === 'beta_alanine').level, 'Lower priority');
  assert.ok(strength.find(s => s.id === 'whey').reason.includes('145 g/day'));
  const conditioning = suggestions({ ...context, goal: 'get_fit', style: 'fitness', rpe: 7 });
  assert.equal(conditioning.find(s => s.id === 'beta_alanine').level, 'If needed');
  assert.ok(conditioning.find(s => s.id === 'beta_alanine').reason.includes('RPE alone'));
  assert.equal(conditioning.find(s => s.id === 'creatine').level, 'If needed');
  assert.ok(conditioning.every(s => !Object.hasOwn(s, 'selected')));
});

test('health and age context limits advice and sodium suggestions', () => {
  for (const profile of [{}, { age: 16 }, { age: 30, health: { conditions: ['pregnancy'] } }]) {
    assert.equal(suggestions({ profile }).every(s => s.level === 'Check first'), true);
  }
  const heart = suggestions({ profile: { age: 35, health: { conditions: ['heart'] } } });
  assert.equal(heart.find(s => s.id === 'electrolytes').level, 'Check first');
  assert.ok(heart.find(s => s.id === 'electrolytes').reason.includes('potassium'));
});

test('vitamin D reflects UK season and unknown diet does not imply nutrient deficiencies', () => {
  const profile = { age: 40 };
  assert.equal(suggestions({ profile, month: 0 }).find(s => s.id === 'vitd').level, 'Consider');
  assert.equal(suggestions({ profile, month: 6 }).find(s => s.id === 'vitd').level, 'If needed');
  const advice = suggestions({ profile, month: 6 });
  assert.equal(advice.find(s => s.id === 'multi').level, 'Lower priority');
  assert.equal(advice.find(s => s.id === 'omega3').level, 'If needed');
  assert.equal(advice.find(s => s.id === 'whey').level, 'If needed');
});
