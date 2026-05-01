function speakText(text, lang) {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function SpeakButton({ text, lang, label, variant = 'light' }) {
  const isDark = variant === 'dark';
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        speakText(text, lang);
      }}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold transition ${
        isDark ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
      }`}
      aria-label={label}
      title={label}
    >
      🔊 <span>{label}</span>
    </button>
  );
}

export default function WordCard({ word, flipped, onFlip }) {
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
              </div>
            )}
          </div>
          <p className="text-sm text-white/75">알고 있었는지 아래 버튼으로 기록하세요</p>
        </section>
      </div>
    </div>
  );
}
