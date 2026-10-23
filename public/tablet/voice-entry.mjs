import { parseSpokenRegister } from './voice-register.mjs';

// A tap-to-listen helper only. Recognized words are shown for review and are
// never stored, synced, or written to billing. Browser speech APIs may send
// audio to the browser provider, so field technicians must opt in.
export function mountVoiceEntry({ input, current, onUse }) {
  const panel = document.createElement('div');
  panel.className = 'voice-meter';
  panel.setAttribute('aria-label', 'Optional voice-assisted register entry');
  panel.innerHTML = [
    '<div class="voice-actions">',
    '<button type="button" class="outline" id="voice-listen">Speak meter number</button>',
    '<span class="muted">Optional · requires browser microphone support</span>',
    '</div>',
    '<p id="voice-status" role="status" aria-live="polite" class="muted">',
    'Say the register number. You must confirm it before it enters the form.</p>',
    '<div id="voice-preview" class="voice-preview" hidden>',
    '<strong>Verify the voice reading</strong>',
    '<p>Selected site and meter: <span id="voice-target"></span></p>',
    '<p>Heard: <span id="voice-heard"></span></p>',
    '<p>Proposed register: <strong id="voice-number"></strong></p>',
    '<div class="voice-actions">',
    '<button type="button" id="voice-use" class="primary">Use this number in the form</button>',
    '<button type="button" id="voice-discard" class="outline">Discard spoken number</button>',
    '</div>',
    '<p class="muted">This does not save a reading. Review the number and press Save reading &amp; next.</p>',
    '</div>',
    '<p class="muted voice-notice">Voice uses your browser’s speech service, which may require internet access or process audio online. Never speak private customer or payment details. Manual entry always works offline.</p>'
  ].join('');
  input.insertAdjacentElement('afterend', panel);
  const q = id => panel.querySelector('#' + id);
  const listen = q('voice-listen');
  const use = q('voice-use');
  const preview = q('voice-preview');
  const status = q('voice-status');
  let recognition = null;
  let candidate = null;
  let sequence = 0;
  function reset(note = 'Speak a number or enter it manually.') {
    sequence++;
    const old = recognition;
    recognition = null;
    candidate = null;
    if (old) {
      try { old.abort(); } catch { /* Browsers may have already ended recognition */ }
    }
    q('voice-target').textContent = '';
    q('voice-heard').textContent = '';
    q('voice-number').textContent = '';
    preview.hidden = true;
    listen.textContent = 'Speak meter number';
    status.textContent = note;
  }
  function updateDisabled() {
    const c = current();
    const disabled = !c.allowed || !c.item || !c.meter;
    listen.disabled = disabled;
    use.disabled = disabled || !candidate || candidate.stopId !== c.item.id;
    q('voice-discard').disabled = disabled;
    if (disabled && (recognition || candidate)) reset('Meter changed or entry locked. Voice suggestion discarded.');
  }
  function startVoice() {
    if (recognition) {
      reset('Listening stopped. Typed register value was not changed.');
      updateDisabled();
      return;
    }
    const c = current();
    if (!c.allowed || !c.item || !c.meter) {
      reset('Unlock an unfinished meter stop first.');
      return;
    }
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      reset('Speech recognition is not available in this browser. Type the register reading instead.');
      return;
    }
    reset();
    const seq = sequence;
    const stopId = c.item.id;
    let session;
    try { session = new Speech(); } catch {
      reset('Microphone could not be opened. Use the manual register field.');
      return;
    }
    recognition = session;
    session.lang = 'en-US';
    session.continuous = false;
    session.interimResults = false;
    session.maxAlternatives = 1;
    listen.textContent = 'Stop listening';
    status.textContent = 'Listening once for the ' + c.meter.utility + ' meter number…';
    session.onresult = event => {
      if (seq !== sequence || current().item?.id !== stopId || !current().allowed) return;
      const heard = String(event.results?.[0]?.[0]?.transcript ?? '').slice(0, 160).trim();
      const result = parseSpokenRegister(heard, c.meter.utility, c.meter.register_digits);
      if (!result.ok) {
        status.textContent = result.reason;
        return;
      }
      candidate = { stopId, value: result.value };
      q('voice-target').textContent = c.assignment.site_label + ' · ' + c.meter.label +
        ' · ' + c.meter.utility;
      q('voice-heard').textContent = heard;
      q('voice-number').textContent = result.value + ' ' + c.meter.unit;
      preview.hidden = false;
      status.textContent = 'Review the suggested digits and meter before using this reading.';
      updateDisabled();
    };
    session.onerror = event => {
      if (seq === sequence)
        status.textContent = 'Speech recognition failed (' + (event.error ?? 'unknown error') +
          '). Enter the register number manually.';
    };
    session.onend = () => {
      if (seq !== sequence) return;
      recognition = null;
      listen.textContent = 'Speak meter number';
      updateDisabled();
    };
    try { session.start(); } catch {
      reset('Microphone permission unavailable. Enter the register number manually.');
      updateDisabled();
    }
  }
  listen.addEventListener('click', startVoice);
  q('voice-discard').addEventListener('click', () => {
    reset('Spoken number discarded. Your typed value was not changed.');
    updateDisabled();
  });
  use.addEventListener('click', () => {
    const c = current();
    if (!candidate || !c.allowed || !c.item || candidate.stopId !== c.item.id) {
      reset('Meter changed. Please dictate again.');
      updateDisabled();
      return;
    }
    const number = candidate.value;
    reset('Number ' + number + ' put into the register form. Inspect it and then save normally.');
    onUse(number);
    updateDisabled();
  });
  input.addEventListener('input', () => {
    if (candidate) {
      reset('Using the manually typed number. Earlier spoken suggestion discarded.');
      updateDisabled();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (candidate || recognition)) {
      reset('Voice cancelled when leaving the reader. No reading saved.');
      updateDisabled();
    }
  });
  updateDisabled();
  return { reset, updateDisabled };
}
