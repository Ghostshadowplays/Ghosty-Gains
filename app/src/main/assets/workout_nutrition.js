/* Shared workout and nutrition calculations, also usable by the regression checks. */
(function (root) {
  'use strict';
  const nutrients = [
    ['calories', 'Calories', 'kcal'], ['protein', 'Protein', 'g'],
    ['carbs', 'Carbohydrates', 'g'], ['fat', 'Fats', 'g'],
    ['fiber', 'Fibre', 'g'], ['sugars', 'Sugars', 'g'],
    ['sodium', 'Sodium', 'mg'], ['cholesterol', 'Cholesterol', 'mg'],
    ['satFat', 'Saturated fat', 'g'], ['unsatFat', 'Unsaturated fat', 'g'],
    ['transFat', 'Trans fat', 'g'], ['potassium', 'Potassium', 'mg']
  ];
  const styles = {
    bodybuilding: { name: 'Bodybuilding Returning', min: 8, max: 10, rpe: 9 },
    fitness: { name: 'General Fitness', min: 6, max: 7, rpe: 6 },
    strength: { name: 'Strength', min: 7, max: 9, rpe: 8 }
  };
  function prescription(value, style = 'bodybuilding') {
    const rpe = Math.max(1, Math.min(10, Math.round(Number(value) || 6)));
    return {
      rpe, exercises: rpe === 10 ? 2 : rpe === 9 ? 3 : rpe === 8 ? 3 : rpe === 7 ? 4 : 5,
      sets: rpe >= 9 ? 2 : rpe >= 7 ? 3 : 4,
      rest: rpe >= 9 ? 60 : rpe >= 7 ? 90 : rpe === 6 ? 120 : 180,
      rir: 10 - rpe,
      reps: style === 'strength' ? '3–6' : style === 'fitness' ? '10–15' : '8–12'
    };
  }
  function nutrientValue(food, key) {
    let value = food[key];
    if ((value == null || value === '') && key === 'sodium' && food.salt != null) value = Number(food.salt) * 400;
    // Missing label data must stay unknown rather than becoming a claimed zero.
    return value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  }
  function scaleNutrition(food, grams) {
    return Object.fromEntries(nutrients.map(([key]) => {
      const value = nutrientValue(food, key);
      return [key, value == null ? null : value * grams / 100];
    }));
  }
  function mealTotals(ingredients) {
    const totals = Object.fromEntries(nutrients.map(([key]) => [key, 0]));
    let weight = 0;
    for (const ingredient of ingredients) {
      const grams = Number(ingredient.grams);
      if (!Number.isFinite(grams) || grams <= 0) continue;
      weight += grams;
      const scaled = scaleNutrition(ingredient.food, grams);
      for (const [key] of nutrients) totals[key] = totals[key] == null || scaled[key] == null ? null : totals[key] + scaled[key];
    }
    return { weight, totals };
  }
  const api = { nutrients, styles, prescription, nutrientValue, scaleNutrition, mealTotals };
  root.GhostyLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
