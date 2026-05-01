import { useEffect, useMemo, useState } from 'react';
import WordCard from './components/WordCard.jsx';
import ProgressBar from './components/ProgressBar.jsx';

const STORAGE_KEY = 'wordLearningProgress.v2';
const emptyProgress = {
  mode: 'learn',
  filter: 'all',
  deck: [],
  deckCursor: 0,
  results: {},
  correct: 0,
  wrong: 0,
  examCorrect: 0,
  examWrong: 0,
  updatedAt: null,
};

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...emptyProgress, ...saved, results: saved?.results ?? {}, deck: saved?.deck ?? [] };
  } catch {
    return emptyProgress;
  }
}

function shuffle(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}

function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s.,!?，、。·・~`'"“”‘’()\[\]{}:;/-]+/g, '')
    .trim();
}

function answerCandidates(word) {
  const raw = [word.meaning, ...(word.acceptedAnswers ?? [])].filter(Boolean);
  return raw
    .flatMap((item) => String(item).split(/[,，、/]| 또는 | 혹은 |\sor\s/i))
    .map((item) => item.trim())
    .filter(Boolean);
}

function judgeAnswer(input, word) {
  const normalizedInput = normalizeAnswer(input);
  if (!normalizedInput || !word) return false;
  return answerCandidates(word).some((candidate) => {
    const normalizedCandidate = normalizeAnswer(candidate);
    return normalizedInput === normalizedCandidate;
  });
}

function makeDeck(words) {
  return shuffle(words.map((word) => word.id));
}

export default function App() {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [examAnswer, setExamAnswer] = useState('');
  const [examFeedback, setExamFeedback] = useState(null);
  const [progress, setProgress] = useState(loadProgress);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}words.json`)
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

  const wordById = useMemo(() => new Map(words.map((word) => [word.id, word])), [words]);

  const validDeck = useMemo(() => {
    const validIds = new Set(filteredWords.map((word) => word.id));
    return progress.deck.filter((id) => validIds.has(id));
  }, [filteredWords, progress.deck]);

  const currentDeck = validDeck.length ? validDeck : makeDeck(filteredWords);
  const currentIndex = currentDeck.length ? progress.deckCursor % currentDeck.length : 0;
  const currentWord = wordById.get(currentDeck[currentIndex]);
  const answeredCount = Object.keys(progress.results).filter((id) => filteredWords.some((word) => word.id === id)).length;
  const isExamMode = progress.mode === 'exam';

  useEffect(() => {
    if (!loading && filteredWords.length && !validDeck.length) {
      setProgress((prev) => ({ ...prev, deck: makeDeck(filteredWords), deckCursor: 0, updatedAt: new Date().toISOString() }));
    }
  }, [loading, filteredWords, validDeck.length]);

  function rebuildDeck(overrides = {}) {
    const targetFilter = overrides.filter ?? progress.filter;
    const targetWords = targetFilter === 'all' ? words : words.filter((word) => word.lang === targetFilter);
    return makeDeck(targetWords);
  }

  function changeFilter(filter) {
    setFlipped(false);
    setExamAnswer('');
    setExamFeedback(null);
    setProgress((prev) => ({ ...prev, filter, deck: rebuildDeck({ filter }), deckCursor: 0, updatedAt: new Date().toISOString() }));
  }

  function changeMode(mode) {
    setFlipped(false);
    setExamAnswer('');
    setExamFeedback(null);
    setProgress((prev) => ({ ...prev, mode, deck: rebuildDeck(), deckCursor: 0, updatedAt: new Date().toISOString() }));
  }

  function moveNext() {
    setProgress((prev) => {
      const nextDeck = currentIndex >= currentDeck.length - 1 ? makeDeck(filteredWords) : currentDeck;
      const nextCursor = currentIndex >= currentDeck.length - 1 ? 0 : currentIndex + 1;
      return { ...prev, deck: nextDeck, deckCursor: nextCursor, updatedAt: new Date().toISOString() };
    });
    setFlipped(false);
    setExamAnswer('');
    setExamFeedback(null);
  }

  function answer(result) {
    if (!currentWord) return;
    const previous = progress.results[currentWord.id];
    const nextResults = { ...progress.results, [currentWord.id]: result };
    const deltaCorrect = (result === 'correct' ? 1 : 0) - (previous === 'correct' ? 1 : 0);
    const deltaWrong = (result === 'wrong' ? 1 : 0) - (previous === 'wrong' ? 1 : 0);

    setProgress((prev) => ({
      ...prev,
      results: nextResults,
      correct: Math.max(0, prev.correct + deltaCorrect),
      wrong: Math.max(0, prev.wrong + deltaWrong),
      updatedAt: new Date().toISOString(),
    }));
    setTimeout(moveNext, 0);
  }

  function submitExam(event) {
    event.preventDefault();
    if (!currentWord || examFeedback) return;
    const correct = judgeAnswer(examAnswer, currentWord);
    const result = correct ? 'correct' : 'wrong';
    const previous = progress.results[currentWord.id];
    const nextResults = { ...progress.results, [currentWord.id]: result };
    const deltaCorrect = (result === 'correct' ? 1 : 0) - (previous === 'correct' ? 1 : 0);
    const deltaWrong = (result === 'wrong' ? 1 : 0) - (previous === 'wrong' ? 1 : 0);

    setProgress((prev) => ({
      ...prev,
      results: nextResults,
      correct: Math.max(0, prev.correct + deltaCorrect),
      wrong: Math.max(0, prev.wrong + deltaWrong),
      examCorrect: prev.examCorrect + (correct ? 1 : 0),
      examWrong: prev.examWrong + (correct ? 0 : 1),
      updatedAt: new Date().toISOString(),
    }));
    setExamFeedback({ correct, answer: currentWord.meaning, candidates: answerCandidates(currentWord) });
  }

  function resetProgress() {
    localStorage.removeItem(STORAGE_KEY);
    setProgress({ ...emptyProgress, deck: makeDeck(filteredWords) });
    setFlipped(false);
    setExamAnswer('');
    setExamFeedback(null);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_35%),linear-gradient(135deg,#f8fafc,#eef2ff)] px-5 py-8 text-slate-900">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-6">
          <header className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-sm backdrop-blur">
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-indigo-500">Flashcard Study</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">영어/일본어 단어 학습</h1>
            <p className="mt-3 text-slate-600">학습모드는 카드로 뜻을 확인하고, 시험모드는 직접 뜻을 입력해 자동 채점합니다.</p>
          </header>

          <div className="flex flex-wrap gap-2">
            {[['learn', '학습모드'], ['exam', '시험모드']].map(([value, label]) => (
              <button key={value} type="button" onClick={() => changeMode(value)} className={`rounded-full px-5 py-2 text-sm font-bold transition ${progress.mode === value ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{label}</button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {[['all', '전체'], ['en', '영어'], ['ja', '일본어']].map(([value, label]) => (
              <button key={value} type="button" onClick={() => changeFilter(value)} className={`rounded-full px-5 py-2 text-sm font-bold transition ${progress.filter === value ? 'bg-slate-950 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{label}</button>
            ))}
          </div>

          {loading && <div className="rounded-3xl bg-white p-8 text-center shadow-sm">단어 데이터를 불러오는 중입니다...</div>}
          {error && <div className="rounded-3xl bg-rose-50 p-8 text-center font-semibold text-rose-700">{error}</div>}

          {!loading && !error && !isExamMode && <WordCard word={currentWord} flipped={flipped} onFlip={() => setFlipped((value) => !value)} />}

          {!loading && !error && isExamMode && (
            <section className="rounded-[2rem] border border-violet-100 bg-white p-8 shadow-xl shadow-violet-100/60">
              <div className="mb-6 flex items-center justify-between">
                <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-600">시험모드</span>
                <span className="text-sm text-slate-400">뜻을 직접 입력하세요</span>
              </div>
              <p className="text-sm font-medium uppercase tracking-[0.35em] text-slate-400">QUESTION</p>
              <h2 className="mt-4 break-words text-5xl font-black tracking-tight text-slate-950 sm:text-6xl">{currentWord?.word ?? '-'}</h2>
              {currentWord?.reading && <p className="mt-4 text-xl text-slate-500">{currentWord.reading}</p>}
              <form onSubmit={submitExam} className="mt-8 space-y-4">
                <input value={examAnswer} onChange={(event) => setExamAnswer(event.target.value)} disabled={!!examFeedback} placeholder="뜻을 입력하세요. 예: 사과" className="w-full rounded-2xl border border-slate-200 px-5 py-4 text-lg outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50" />
                <button type="submit" disabled={!currentWord || !examAnswer.trim() || !!examFeedback} className="w-full rounded-2xl bg-violet-600 px-6 py-4 text-lg font-black text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">정답 확인</button>
              </form>
              {examFeedback && (
                <div className={`mt-6 rounded-2xl p-5 ${examFeedback.correct ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                  <p className="text-lg font-black">{examFeedback.correct ? '정답입니다!' : '오답입니다.'}</p>
                  <p className="mt-2 text-sm">정답: {examFeedback.answer}</p>
                  <button type="button" onClick={moveNext} className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">다음 랜덤 단어</button>
                </div>
              )}
            </section>
          )}

          {!isExamMode && (
            <div className="grid gap-3 sm:grid-cols-3">
              <button type="button" onClick={() => answer('wrong')} disabled={!currentWord} className="rounded-3xl bg-rose-500 px-6 py-4 text-lg font-black text-white shadow-lg shadow-rose-200 transition hover:-translate-y-0.5 hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40">오답</button>
              <button type="button" onClick={() => answer('correct')} disabled={!currentWord} className="rounded-3xl bg-emerald-500 px-6 py-4 text-lg font-black text-white shadow-lg shadow-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">정답</button>
              <button type="button" onClick={moveNext} disabled={!currentWord} className="rounded-3xl bg-slate-900 px-6 py-4 text-lg font-black text-white shadow-lg shadow-slate-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40">건너뛰기</button>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <ProgressBar current={answeredCount} total={filteredWords.length} correct={progress.correct} wrong={progress.wrong} examCorrect={progress.examCorrect} examWrong={progress.examWrong} />
          <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
            <h2 className="text-lg font-black">현재 상태</h2>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex justify-between"><dt>모드</dt><dd>{isExamMode ? '시험모드' : '학습모드'}</dd></div>
              <div className="flex justify-between"><dt>랜덤 순서</dt><dd>{filteredWords.length ? currentIndex + 1 : 0} / {filteredWords.length}</dd></div>
              <div className="flex justify-between"><dt>저장 키</dt><dd>{STORAGE_KEY}</dd></div>
              <div className="flex justify-between"><dt>최근 저장</dt><dd>{progress.updatedAt ? new Date(progress.updatedAt).toLocaleString('ko-KR') : '아직 없음'}</dd></div>
            </dl>
            <button type="button" onClick={() => setProgress((prev) => ({ ...prev, deck: makeDeck(filteredWords), deckCursor: 0, updatedAt: new Date().toISOString() }))} className="mt-5 w-full rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100">랜덤 순서 다시 섞기</button>
            <button type="button" onClick={resetProgress} className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50">진도 초기화</button>
          </section>
          <section className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl">
            <h2 className="font-black">사용법</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-300">
              <li>학습모드: 카드를 눌러 뜻을 확인한 뒤 정답/오답을 기록합니다.</li>
              <li>시험모드: 뜻을 직접 입력하면 프로그램이 자동 채점합니다.</li>
              <li>두 모드 모두 단어는 랜덤 순서로 출제됩니다.</li>
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}
