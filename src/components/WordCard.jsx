import { useMemo, useState } from 'react';

const API_BASE = 'https://lumi-storage.taild1716c.ts.net';

function isAndroidEdge() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent) && /EdgA/i.test(navigator.userAgent);
}

function getSpeechSupport() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function scoreVoice(voice, lang) {
  const wantedLang = lang.toLowerCase();
  const baseLang = wantedLang.split('-')[0];
  const voiceLang = String(voice.lang || '').toLowerCase();
  const name = String(voice.name || '').toLowerCase();
  let score = 0;

  if (voiceLang === wantedLang) score += 100;
  else if (voiceLang.startsWith(baseLang)) score += 70;
  if (voice.default) score += 5;

  const preferredEnglish = ['samantha', 'google us english', 'google uk english female', 'karen', 'moira', 'tessa', 'victoria', 'ava', 'allison', 'susan', 'zira'];
  const preferredJapanese = ['kyoko', 'google 日本語', 'google japanese', 'otoya', 'sayaka', 'haruka'];
  const avoid = ['daniel', 'alex', 'fred', 'tom', 'david', 'mark', 'male', 'compact', 'whisper', 'novelty'];
  const preferred = baseLang === 'ja' ? preferredJapanese : preferredEnglish;

  preferred.forEach((keyword, index) => {
    if (name.includes(keyword)) score += 60 - index;
  });
  avoid.forEach((keyword) => {
    if (name.includes(keyword)) score -= 40;
  });

  return score;
}

function pickVoice(lang) {
  if (!getSpeechSupport()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return [...voices].sort((a, b) => scoreVoice(b, lang) - scoreVoice(a, lang))[0] || null;
}

async function playServerTts(text, lang, onStatus) {
  const normalizedLang = lang.toLowerCase().startsWith('ja') ? 'ja' : 'en';
  const url = `${API_BASE}/word-tts?lang=${encodeURIComponent(normalizedLang)}&text=${encodeURIComponent(text)}`;
  onStatus?.('서버 음성 준비 중...');
  const audio = new Audio(url);
  audio.preload = 'auto';
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.oncanplay = null;
      audio.onerror = null;
      audio.onended = null;
    };
    audio.oncanplay = () => {
      audio.play()
        .then(() => {
          onStatus?.('재생 중...');
          resolve();
        })
        .catch((error) => {
          cleanup();
          reject(error);
        });
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error('server_tts_failed'));
    };
    audio.onended = () => {
      cleanup();
      onStatus?.('');
    };
    audio.load();
  });
}

function speakWithBrowser(text, lang, onStatus) {
  if (!text || !getSpeechSupport()) {
    onStatus?.('서버 음성 재생에 실패했고, 이 브라우저는 기기 음성도 지원하지 않을 수 있습니다.');
    return;
  }

  const speak = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
      onStatus?.('서버 음성 재생에 실패했고, 사용 가능한 기기 음성 엔진도 찾지 못했습니다.');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.voice = pickVoice(lang);
    utterance.rate = 0.88;
    utterance.pitch = 1.05;
    utterance.volume = 1;
    utterance.onstart = () => onStatus?.('기기 음성으로 재생 중...');
    utterance.onend = () => onStatus?.('');
    utterance.onerror = () => onStatus?.('음성 재생에 실패했습니다. 네트워크 또는 기기 TTS 설정을 확인해주세요.');
    window.speechSynthesis.speak(utterance);
  };

  if (window.speechSynthesis.getVoices().length) {
    speak();
    return;
  }

  window.speechSynthesis.onvoiceschanged = speak;
  setTimeout(speak, 250);
}

async function speakText(text, lang, onStatus) {
  if (!text) return;
  if (getSpeechSupport()) {
    speakWithBrowser(text, lang, onStatus);
    return;
  }
  try {
    await playServerTts(text, lang, onStatus);
  } catch {
    speakWithBrowser(text, lang, onStatus);
  }
}

export function SpeakButton({ text, lang, label, variant = 'light' }) {
  const [status, setStatus] = useState('');
  const isDark = variant === 'dark';

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          speakText(text, lang, setStatus);
        }}
        disabled={!text}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
          isDark ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
        }`}
        aria-label={label}
        title={label}
      >
        🔊 <span>{label}</span>
      </button>
      {status && <span className={`max-w-56 text-xs ${isDark ? 'text-white/80' : 'text-slate-500'}`}>{status}</span>}
    </div>
  );
}

export default function WordCard({ word, flipped, onFlip }) {
  const androidEdgeWarning = useMemo(() => isAndroidEdge(), []);

  if (!word) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        표시할 단어가 없습니다.
      </div>
    );
  }

  const languageLabel = word.lang === 'ja' ? '일본어' : '영어';
  const speechLang = word.lang === 'ja' ? 'ja-JP' : 'en-US';

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onFlip();
    }
  }

  return (
    <div role="button" tabIndex={0} onClick={onFlip} onKeyDown={handleKeyDown} className="card-3d group h-[30rem] w-full cursor-pointer text-left outline-none focus-visible:ring-4 focus-visible:ring-indigo-200" aria-label={flipped ? '단어 카드 앞면 보기' : '단어 카드 뜻 보기'}>
      <div className={`card-inner relative h-full w-full rounded-[2rem] transition-transform duration-500 ${flipped ? '[transform:rotateY(180deg)]' : ''}`}>
        <section className="card-face absolute inset-0 flex h-full w-full flex-col justify-between rounded-[2rem] border border-indigo-100 bg-white p-8 shadow-xl shadow-indigo-100/60">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-600">{languageLabel}</span>
            <span className="text-sm text-slate-400">클릭해서 뜻 보기</span>
          </div>
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.35em] text-slate-400">WORD</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h2 className="break-words text-5xl font-black tracking-tight text-slate-950 sm:text-6xl">{word.word}</h2>
              <SpeakButton text={word.word} lang={speechLang} label="단어 듣기" />
            </div>
            {word.reading && <p className="mt-4 text-xl text-slate-500">{word.reading}</p>}
            {androidEdgeWarning && <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-700">기기 음성을 먼저 재생합니다. 지원되지 않으면 서버 음성으로 전환합니다.</p>}
          </div>
          <p className="text-sm text-slate-400">학습모드는 뜻과 예문 해석을 볼 수 있습니다</p>
        </section>

        <section className="card-face card-back absolute inset-0 flex h-full w-full flex-col justify-between overflow-y-auto rounded-[2rem] border border-emerald-100 bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-white shadow-xl shadow-emerald-100/80">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">뜻</span>
            <span className="text-sm text-white/75">다시 클릭하면 단어</span>
          </div>
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.35em] text-white/70">MEANING</p>
            <h2 className="mt-4 break-words text-4xl font-black tracking-tight sm:text-5xl">{word.meaning}</h2>
            {word.example && (
              <div className="mt-6 space-y-3 rounded-2xl bg-white/15 p-4 text-base leading-7 text-white/90">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-semibold">{word.example}</p>
                  <SpeakButton text={word.example} lang={speechLang} label="예문 듣기" variant="dark" />
                </div>
                {word.lang === 'ja' && word.exampleReading && <p className="text-sm text-white/80">발음: {word.exampleReading}</p>}
                {word.exampleMeaning && <p className="text-sm text-white/90">뜻: {word.exampleMeaning}</p>}
                {androidEdgeWarning && <p className="rounded-xl bg-white/15 p-3 text-xs text-white/80">기기 음성이 지원되지 않으면 서버 음성으로 전환합니다.</p>}
              </div>
            )}
          </div>
          <p className="text-sm text-white/75">알고 있었는지 아래 버튼으로 기록하세요</p>
        </section>
      </div>
    </div>
  );
}
