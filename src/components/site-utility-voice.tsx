'use client';

import { useEffect, useRef, useState } from 'react';
import { cents } from '@/lib/billing-domain';
import type { SiteUtilitySummary, UtilityKind } from '@/lib/site-utility-summary';

type VoiceResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: VoiceResult) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}
function voiceText(site: string, cards: SiteUtilitySummary[], kind?: UtilityKind): string {
  const selected = kind ? cards.filter(c => c.kind === kind) : cards;
  const sections = selected.map(c => {
    const name = c.kind === 'electric' ? 'Electricity' : c.kind === 'water' ? 'Water' : 'Gas';
    if (!c.meters.length) return name + ': no linked active meter.';
    const readings = c.meters.map(m => m.latestApproved === null
      ? m.meterLabel + ': no approved reading.'
      : m.meterLabel + ': last approved register ' + m.latestApproved + ' ' + m.unit +
        (m.scaledUsage === null ? '. Usage not ready for automatic calculation.'
          : '. Approved register change ' + m.scaledUsage + ' ' + m.unit + '.')
    ).join(' ');
    const billed = c.lastIssued ? ' Last issued ' + name.toLowerCase() +
      ' charge: ' + cents(c.lastIssued.amountCents) + '.' : ' No issued charge shown.';
    return name + '. ' + readings + billed;
  });
  return 'Site ' + site + '. ' + sections.join(' ');
}
function chosenUtility(value: string): UtilityKind | undefined {
  if (/\b(electric|electricity|power)\b/i.test(value)) return 'electric';
  if (/\bwater\b/i.test(value)) return 'water';
  if (/\bgas\b/i.test(value)) return 'gas';
  return undefined;
}
export function SiteUtilityVoice({
  siteLabel, cards,
}: { siteLabel: string; cards: SiteUtilitySummary[] }) {
  const recognition = useRef<RecognitionLike | null>(null);
  const [status, setStatus] = useState('');
  const [listening, setListening] = useState(false);
  useEffect(() => () => {
    recognition.current?.abort();
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, []);

  function speak(kind?: UtilityKind) {
    if (typeof window === 'undefined' || !window.speechSynthesis ||
      typeof SpeechSynthesisUtterance === 'undefined') {
      setStatus('Spoken responses are not supported by this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(voiceText(siteLabel, cards, kind));
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    setStatus(kind ? 'Reading ' + kind + ' information aloud.' : 'Reading site meter information aloud.');
  }
  function listen() {
    if (listening) {
      recognition.current?.abort();
      setListening(false);
      setStatus('Voice listening stopped.');
      return;
    }
    type VoiceWindow = Window & {
      SpeechRecognition?: new () => RecognitionLike;
      webkitSpeechRecognition?: new () => RecognitionLike;
    };
    const voiceWindow = window as VoiceWindow;
    const Constructor = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setStatus('Voice questions are not supported here. Use Read meters aloud or the on-screen cards.');
      return;
    }
    const next = new Constructor();
    recognition.current = next;
    next.lang = 'en-US';
    next.continuous = false;
    next.interimResults = false;
    next.onresult = (event) => {
      const command = event.results[0]?.[0]?.transcript?.trim() ?? '';
      const kind = chosenUtility(command);
      setStatus('Heard: ' + command);
      if (kind || /\b(all|meters|readings)\b/i.test(command)) speak(kind);
      else setStatus('Say electric, water, gas, or all readings.');
    };
    next.onerror = (event) => setStatus('Voice recognition unavailable: ' + event.error);
    next.onend = () => {
      setListening(false);
      recognition.current = null;
    };
    try {
      next.start();
      setListening(true);
      setStatus('Listening once. Say electric, water, gas, or all readings.');
    } catch {
      setStatus('Could not start voice listening. Check microphone permission and browser support.');
    }
  }
  return (
    <div className="site-meter-voice" aria-label="Optional voice meter helper">
      <div className="action-group">
        <button className="button secondary" type="button" onClick={() => speak()}>
          Read meters aloud
        </button>
        <button className="button secondary" type="button" onClick={listen}
          aria-pressed={listening}>
          {listening ? 'Stop listening' : 'Ask by voice'}
        </button>
        <button className="button secondary" type="button"
          onClick={() => { recognition.current?.abort(); window.speechSynthesis?.cancel(); setStatus('Voice stopped.'); }}>
          Stop voice
        </button>
      </div>
      {status && <p role="status" className="muted small">{status}</p>}
      <p className="muted small">Voice is optional and read-only. Microphone access starts only when you tap Ask by voice. Browser speech recognition may use an online service; don't dictate private payment details.</p>
    </div>
  );
}
