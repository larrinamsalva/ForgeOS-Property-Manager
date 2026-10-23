// Conservative, local parsing of a short dictated register value. Do not
// guess at numbers or infer an incorrect meter/utility from speech.
const units = new Map([
  ['zero', 0], ['oh', 0], ['one', 1], ['two', 2], ['three', 3],
  ['four', 4], ['five', 5], ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9],
  ['ten', 10], ['eleven', 11], ['twelve', 12], ['thirteen', 13],
  ['fourteen', 14], ['fifteen', 15], ['sixteen', 16], ['seventeen', 17],
  ['eighteen', 18], ['nineteen', 19],
]);
const tens = new Map([
  ['twenty', 20], ['thirty', 30], ['forty', 40], ['fifty', 50],
  ['sixty', 60], ['seventy', 70], ['eighty', 80], ['ninety', 90],
]);
const kinds = {
  electric: /\b(?:electric|electricity|power)\b/,
  water: /\bwater\b/,
  gas: /\bgas\b/,
};
function cardinal(words) {
  if (!words.length) return null;
  if (words.every(w => units.has(w) && units.get(w) <= 9))
    return words.map(w => units.get(w)).join('');
  let total = 0, group = 0, lastScale = Infinity, previous = '';
  for (const word of words) {
    if (word === 'and') continue;
    if (units.has(word)) {
      if (previous === 'unit' && group % 100 < 20) return null;
      group += units.get(word);
      previous = 'unit';
    } else if (tens.has(word)) {
      if (group % 100 && group % 100 < 20) return null;
      group += tens.get(word);
      previous = 'tens';
    } else if (word === 'hundred') {
      if (group < 1 || group > 9) return null;
      group *= 100;
      previous = 'hundred';
    } else if (['thousand', 'million', 'billion'].includes(word)) {
      const scale = word === 'thousand' ? 1000 : word === 'million' ? 1000000 : 1000000000;
      if (!group || scale >= lastScale) return null;
      total += group * scale;
      group = 0;
      lastScale = scale;
      previous = 'scale';
    } else return null;
  }
  return String(total + group);
}
export function parseSpokenRegister(input, utility, digits) {
  const fail = reason => ({ ok: false, reason });
  if (typeof input !== 'string' || input.length > 160 ||
    !Number.isInteger(digits) || digits < 1 || digits > 12 || !kinds[utility])
    return fail('Invalid meter or voice input.');
  let text = input.normalize('NFKC').toLowerCase().trim();
  if (!text) return fail('No number was heard. Try again.');
  const said = Object.entries(kinds).filter(([, p]) => p.test(text)).map(([kind]) => kind);
  if (said.length > 1 || (said.length === 1 && said[0] !== utility))
    return fail('Spoken utility does not match the selected meter. Confirm the site and service.');
  text = text.replace(/\b(?:electricity|electric|power|water|gas)\b/g, ' ')
    .replace(/[!?]/g, ' ').replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:(?:the|it|is|reads|reading|meter|register|value|number|says|shows|at|for|of|on|please|current|currently|my|this|site)\s+)+/, '').trim();
  if (!text) return fail('Speak the register number.');
  let value = null;
  if (/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(text))
    value = text.replace(/,/g, '');
  else {
    const sections = text.replace(/-/g, ' ').replace(/\b(?:point|dot|decimal)\b/g, '.')
      .replace(/\s*\.\s*/g, '.').split('.');
    if (sections.length > 2) return fail('Only one decimal point is allowed.');
    const integer = cardinal(sections[0].split(/\s+/).filter(Boolean));
    let fraction = null;
    if (sections.length === 2) {
      const words = sections[1].split(/\s+/).filter(Boolean);
      if (words.length && words.every(w => (units.has(w) && units.get(w) <= 9) || /^\d$/.test(w)))
        fraction = words.map(w => /^\d$/.test(w) ? w : units.get(w)).join('');
    }
    if (integer !== null && (sections.length === 1 || fraction !== null))
      value = integer + (fraction === null ? '' : '.' + fraction);
  }
  if (!value || !/^\d{1,12}(?:\.\d{1,6})?$/.test(value))
    return fail('Unclear number. Speak digits separately or enter them manually.');
  if (value.split('.')[0].length > digits)
    return fail('Spoken number exceeds the selected meter register digits.');
  return { ok: true, value };
}
