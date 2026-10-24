(function (root) {
  'use strict';
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const date = new Date(value + 'T12:00:00');
    return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4))
      && date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10));
  }
  function shiftDate(value, amount) {
    if (!validDate(value)) throw new Error('Choose a valid date.');
    const date = new Date(value + 'T12:00:00');
    date.setDate(date.getDate() + amount);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function copyMealPlans(entries, start, days, today, idFactory) {
    if (!validDate(start) || start < today || !Number.isInteger(days) || days < 1 || days > 7) throw new Error('Choose today or a future start date and 1–7 days.');
    if (!entries.length) throw new Error('Add some meals to the selected day first.');
    const result = [];
    for (let day = 0; day < days; day++) {
      const date = shiftDate(start, day);
      for (const entry of entries) result.push({ ...JSON.parse(JSON.stringify(entry)), id: idFactory(), date, planned: true, timestamp: '' });
    }
    return result;
  }
  function numberFromLabel(value, integer = false) {
    const match = String(value).match(/\d[\d\s,.]*/);
    if (!match) return null;
    let text = match[0].trim().replace(/\s/g, '');
    if (integer) text = text.replace(/[,.](?=\d{3}(?:[,.]|$))/g, '');
    if (text.includes(',') && text.includes('.')) text = text.replace(/,/g, '');
    else if (text.includes(',')) text = /,\d{3}$/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.');
    const number = Number(text);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }
  const labels = {
    steps: /\b(steps?|strides?)\b/i,
    calories: /\b(calories?|kcals?|cals?|kilocalories|kilojoules|kj)\b/i,
    distanceKm: /\b(distance|dist\.?|kilomet(?:er|re)s?|miles?)\b/i,
    minutes: /\b(elapsed|duration|time)(?:\s+elapsed)?\b/i
  };
  const otherLabels = /\b(speed|incline|level|watts|resistance|heart\s*rate|rpm|pace|mets|pulse)\b/i;
  const excludedReadings = /\b(remaining|target|goal|left)\b/i;
  function parseMachineDisplay(text, boxes = []) {
    const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const result = { steps: null, calories: null, distanceKm: null, minutes: null };
    const isLabel = line => Object.values(labels).some(re => re.test(line)) || otherLabels.test(line);
    const firstLabel = lines.findIndex(isLabel);
    const firstValue = lines.findIndex(line => !isLabel(line) && /\d/.test(line));
    const valuesBeforeLabels = firstValue >= 0 && firstValue < firstLabel;
    for (const [key, label] of Object.entries(labels)) {
      const index = lines.findIndex(line => label.test(line) && !excludedReadings.test(line));
      let valueText = '';
      let unitsText = '';
      if (index >= 0) {
        const match = label.exec(lines[index]);
        unitsText = match[0];
        const after = lines[index].slice(match.index + match[0].length);
        const nextLabels = [...Object.entries(labels).filter(([name]) => name !== key).map(([, re]) => re), otherLabels].map(re => re.exec(after)).filter(Boolean);
        const end = nextLabels.length ? Math.min(...nextLabels.map(match => match.index)) : after.length;
        const afterValue = after.slice(0, end);
        const before = lines[index].slice(0, match.index);
        if (/\d/.test(afterValue)) valueText = afterValue;
        else if (!isLabel(before) && /\d/.test(before)) valueText = before;
      }
      if (!/\d/.test(valueText) && index >= 0) {
        const labelBox = boxes.find(box => box.text.trim() === lines[index]);
        if (labelBox) {
          const candidates = boxes.filter(box => /\d/.test(box.text) && !isLabel(box.text))
            .map(box => ({ box, score: Math.abs(box.x - labelBox.x) * 2 + Math.abs(box.y - labelBox.y) }))
            .sort((a, b) => a.score - b.score);
          if (candidates[0] && candidates[0].score < Math.max(labelBox.width || 0, labelBox.height || 0, 60) * 3
              && (!candidates[1] || candidates[1].score - candidates[0].score > 8)) valueText = candidates[0].box.text;
        }
        if (!/\d/.test(valueText)) {
          const offsets = valuesBeforeLabels ? [-1, 1] : [1, -1];
          for (const offset of offsets) {
            const nearby = lines[index + offset];
            if (nearby && !isLabel(nearby) && /\d/.test(nearby)) { valueText = nearby; break; }
          }
        }
      }
      if (index < 0 && key === 'distanceKm') valueText = lines.find(line => /\d[\d.,]*\s*(km|mi|miles?)\b/i.test(line) && !/\/(h|hr)|mph|kmh/i.test(line) && !excludedReadings.test(line) && !otherLabels.test(line)) || '';
      unitsText += ' ' + valueText;
      if (key === 'minutes' && /\d+:\d{2}/.test(valueText)) {
        const parts = valueText.match(/\d{1,3}:\d{2}(?::\d{2})?/)[0].split(':').map(Number);
        if (parts.at(-1) < 60 && (parts.length === 2 || parts[1] < 60)) result.minutes = parts.length === 3 ? parts[0] * 60 + parts[1] + parts[2] / 60 : parts[0] + parts[1] / 60;
      } else {
        let value = numberFromLabel(valueText, key === 'steps');
        if (value == null) continue;
        if (key === 'steps' && !Number.isInteger(value)) continue;
        if (key === 'distanceKm' && /\b(mi|miles?)\b/i.test(unitsText)) value *= 1.609344;
        else if (key === 'distanceKm' && /\bmet(?:er|re)s?\b|\bM\b/i.test(unitsText)) value /= 1000;
        if (key === 'calories' && /\b(kj|kilojoules)\b/i.test(unitsText)) value /= 4.184;
        if (key === 'minutes' && /\b(hours?|hrs?)\b/i.test(unitsText)) value *= 60;
        result[key] = value;
      }
    }
    return result;
  }
  function validateMachineMetrics(values) {
    const limits = { steps: 200000, calories: 20000, distanceKm: 500, minutes: 1440 };
    let hasValue = false;
    const metrics = {};
    for (const key of Object.keys(limits)) {
      if (values[key] == null || values[key] === '') { metrics[key] = null; continue; }
      const value = Number(values[key]);
      if (!Number.isFinite(value) || value < 0 || value > limits[key] || (key === 'steps' && !Number.isInteger(value))) throw new Error('Check the workout values. Steps must be whole numbers; values must be within one day of activity.');
      metrics[key] = value;
      if (value > 0) hasValue = true;
    }
    if (!hasValue) throw new Error('Enter at least one workout value above zero.');
    return metrics;
  }
  const api = { validDate, shiftDate, copyMealPlans, parseMachineDisplay, validateMachineMetrics };
  root.GhostyDaily = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
