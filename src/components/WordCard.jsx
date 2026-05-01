export default function WordCard({ word, flipped, onFlip }) {
  if (!word) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        표시할 단어가 없습니다.
      </div>
    );
  }

  const languageLabel = word.lang === 'ja' ? '일본어' : '영어';

  return (
    <button type="button" onClick={onFlip} className="card-3d group h-80 w-full text-left outline-none focus-visible:ring-4 focus-visible:ring-indigo-200" aria-label={flipped ? '단어 카드 앞면 보기' : '단어 카드 뜻 보기'}>
      <div className={`card-inner relative h-full w-full rounded-[2rem] transition-transform duration-500 ${flipped ? '[transform:rotateY(180deg)]' : ''}`}>
        <section className="card-face absolute inset-0 flex h-full w-full flex-col justify-between rounded-[2rem] border border-indigo-100 bg-white p-8 shadow-xl shadow-indigo-100/60">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-600">{languageLabel}</span>
            <span className="text-sm text-slate-400">클릭해서 뜻 보기</span>
          </div>
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.35em] text-slate-400">WORD</p>
            <h2 className="mt-4 break-words text-5xl font-black tracking-tight text-slate-950 sm:text-6xl">{word.word}</h2>
            {word.reading && <p className="mt-4 text-xl text-slate-500">{word.reading}</p>}
          </div>
          <p className="text-sm text-slate-400">학습모드는 뜻을 볼 수 있습니다</p>
        </section>

        <section className="card-face card-back absolute inset-0 flex h-full w-full flex-col justify-between rounded-[2rem] border border-emerald-100 bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-white shadow-xl shadow-emerald-100/80">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">뜻</span>
            <span className="text-sm text-white/75">다시 클릭하면 단어</span>
          </div>
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.35em] text-white/70">MEANING</p>
            <h2 className="mt-4 break-words text-4xl font-black tracking-tight sm:text-5xl">{word.meaning}</h2>
            {word.example && <p className="mt-6 rounded-2xl bg-white/15 p-4 text-base leading-7 text-white/90">{word.example}</p>}
          </div>
          <p className="text-sm text-white/75">알고 있었는지 아래 버튼으로 기록하세요</p>
        </section>
      </div>
    </button>
  );
}
