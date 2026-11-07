// Síntese (TTS) e reconhecimento de voz (STT) usando as Web Speech APIs do navegador.

const synth = window.speechSynthesis;
let voices = [];

function loadVoices() {
  voices = synth ? synth.getVoices() : [];
}
if (synth) {
  loadVoices();
  synth.addEventListener?.("voiceschanged", loadVoices);
}

// Vozes "naturais" (Edge/Chrome) soam bem melhor; usamos a melhor disponível.
const PREFERRED = [/natural.*en-US|en-US.*natural/i, /Google US English/i, /Aria|Jenny|Guy|Samantha/i];

function pickVoice(lang) {
  const candidates = voices.filter((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
  for (const pattern of PREFERRED) {
    const match = candidates.find((v) => pattern.test(`${v.name} ${v.lang}`));
    if (match) return match;
  }
  return candidates.find((v) => v.lang === lang) || candidates[0] || null;
}

export const ttsSupported = Boolean(synth);

/** Fala o texto em inglês. Resolve quando termina. */
export function speak(text, { rate = 0.92, lang = "en-US", onBoundary } = {}) {
  return new Promise((resolve) => {
    if (!synth || !text) return resolve();
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/\b[AB]:\s*/g, ""));
    utterance.lang = lang;
    utterance.rate = rate;
    const voice = pickVoice(lang);
    if (voice) utterance.voice = voice;
    utterance.onend = utterance.onerror = () => resolve();
    if (onBoundary) utterance.onboundary = onBoundary;
    synth.speak(utterance);
  });
}

export function stopSpeaking() {
  synth?.cancel();
}

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const sttSupported = Boolean(Recognition);

/**
 * Cria um gravador de voz.
 * @param {{lang?: string, onInterim?: (t: string) => void}} options
 * @returns {{start: () => Promise<string>, stop: () => void} | null}
 */
export function createRecognizer({ lang = "en-US", onInterim } = {}) {
  if (!Recognition) return null;
  let rec = null;
  return {
    start() {
      return new Promise((resolve, reject) => {
        rec = new Recognition();
        rec.lang = lang;
        rec.interimResults = true;
        rec.continuous = false;
        rec.maxAlternatives = 1;
        let finalText = "";
        rec.onresult = (e) => {
          let interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = e.results[i][0].transcript;
            if (e.results[i].isFinal) finalText += t;
            else interim += t;
          }
          onInterim?.((finalText + " " + interim).trim());
        };
        rec.onerror = (e) => {
          if (e.error === "no-speech" || e.error === "aborted") resolve(finalText.trim());
          else reject(new Error(e.error === "not-allowed" ? "Permita o uso do microfone no navegador." : e.error));
        };
        rec.onend = () => resolve(finalText.trim());
        rec.start();
      });
    },
    stop() {
      rec?.stop();
    },
  };
}
