import { useEffect, useMemo, useState } from 'react';
import WordCard from './components/WordCard.jsx';
import ProgressBar from './components/ProgressBar.jsx';

const STORAGE_KEY = 'wordLearningProgress.v1';
const emptyProgress = {
  currentIndex: 0,
  filter: 'all',
  results: {},
  correct: 0,
  wrong: 0,
  updatedAt: null,
};

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...emptyProgress, ...saved, results: saved?.results ?? {} };
  } catch {
    return emptyProgress;
  }
}

function normalizeIndex(index, total) {
  if (total <= 0) return 0;
  return Math.min(Math.max(index, 0), total - 1);
}

export default function App() {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [progress, setProgress] = useState(loadProgress);

  useEffect(() => {
    fetch('/words.json')
      .then((response) => {
        if (!response.ok) throw new Error('words.json을 불러오지 못했습니다.');
        return response.json();
      })
      .then((data) => {
        setWords(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || '단어 데이터를 불러오지 못했습니다.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  const filteredWords = useMemo(() => {
    if (progress.filter === 'all') return words;
    return words.filter((word) => word.lang === progress.filter);
  }, [words, progress.filter]);

  const currentIndex = normalizeIndex(progress.currentIndex, filteredWords.length);
  const currentWord = filteredWords[currentIndex];
  const answeredCount = Object.keys(progress.results).filter((id) => filteredWords.some((word) => word.id === id)).length;

  function changeFilter(filter) {
    setFlipped(false);
    setProgress((prev) => ({ ...prev, filter, currentIndex: 0, updatedAt: new Date().toISOString() }));
  }

  function answer(result) {
    if (!currentWord) return;
    const previous = progress.results[currentWord.id];
    const nextResults = { ...progress.results, [currentWord.id]: result };
    const deltaCorrect = (result === 'correct' ? 1 : 0) - (previous === 'correct' ? 1 : 0);
    const deltaWrong = (result === 'wrong' ? 1 : 0) - (previous === 'wrong' ? 1 : 0);

    setProgress((prev) => ({
      ...prev,
      currentIndex: filteredWords.length ? (currentIndex + 1) % filteredWords.length : 0,
      results: nextResults,
      correct: Math.max(0, prev.correct + deltaCorrect),
      wrong: Math.max(0, prev.wrong + deltaWrong),
      updatedAt: new Date().toISOString(),
    }));
    setFlipped(false);
  }

  function resetProgress() {
    localStorage.removeItem(STORAGE_KEY);
    setProgress(emptyProgress);
    setFlipped(false);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_35%),linear-gradient(135deg,#f8fafc,#eef2ff)] px-5 py-8 text-slate-900">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-6">
          <header className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-sm backdrop-blur">
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-indigo-500">Flashcard Study</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">영어/일본어 단어 학습</h1>
            <p className="mt-3 text-slate-600">카드를 눌러 뜻을 확인하고, 정답/오답으로 오늘의 진도를 저장하세요.</p>
          </header>

          <div className="flex flex-wrap gap-2">
            {[['all', '전체'], ['en', '영어'], ['ja', '일본어']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeFilter(value)}
                className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                  progress.filter === value ? 'bg-slate-950 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {loading && <div className="rounded-3xl bg-white p-8 text-center shadow-sm">단어 데이터를 불러오는 중입니다...</div>}
          {error && <div className="rounded-3xl bg-rose-50 p-8 text-center font-semibold text-rose-700">{error}</div>}
          {!loading && !error && <WordCard word={currentWord} flipped={flipped} onFlip={() => setFlipped((value) => !value)} />}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => answer('wrong')}
              disabled={!currentWord}
              className="rounded-3xl bg-rose-500 px-6 py-4 text-lg font-black text-white shadow-lg shadow-rose-200 transition hover:-translate-y-0.5 hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              오답
            </button>
            <button
              type="button"
              onClick={() => answer('correct')}
              disabled={!currentWord}
              className="rounded-3xl bg-emerald-500 px-6 py-4 text-lg font-black text-white shadow-lg shadow-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              정답
            </button>
          </div>
        </section>

        <aside className="space-y-6">
          <ProgressBar current={answeredCount} total={filteredWords.length} correct={progress.correct} wrong={progress.wrong} />
          <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
            <h2 className="text-lg font-black">현재 카드</h2>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex justify-between"><dt>번호</dt><dd>{filteredWords.length ? currentIndex + 1 : 0} / {filteredWords.length}</dd></div>
              <div className="flex justify-between"><dt>저장 키</dt><dd>{STORAGE_KEY}</dd></div>
              <div className="flex justify-between"><dt>최근 저장</dt><dd>{progress.updatedAt ? new Date(progress.updatedAt).toLocaleString('ko-KR') : '아직 없음'}</dd></div>
            </dl>
            <button
              type="button"
              onClick={resetProgress}
              className="mt-5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              진도 초기화
            </button>
          </section>
          <section className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl">
            <h2 className="font-black">사용법</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-300">
              <li>카드를 눌러 뜻을 확인합니다.</li>
              <li>알고 있으면 정답, 헷갈리면 오답을 누릅니다.</li>
              <li>진도는 브라우저 localStorage에 자동 저장됩니다.</li>
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}
