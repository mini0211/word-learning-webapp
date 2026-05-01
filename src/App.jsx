import { useEffect, useMemo, useState } from 'react';
import WordCard from './components/WordCard.jsx';
import ProgressBar from './components/ProgressBar.jsx';

const STORAGE_KEY = 'wordLearningProgress.v2';
const AUTH_KEY = 'wordLearningAuth.v1';
const API_BASE = 'https://lumi-storage.taild1716c.ts.net';

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

const emptyAuthForm = {
  username: '',
  password: '',
  passwordConfirm: '',
  displayName: '',
  realName: '',
  birthDate: '',
  preferredLanguage: 'all',
};

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...emptyProgress, ...saved, results: saved?.results ?? {}, deck: saved?.deck ?? [] };
  } catch {
    return emptyProgress;
  }
}

function loadAuth() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUTH_KEY));
    return saved?.token ? saved : null;
  } catch {
    return null;
  }
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'api_error');
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('request_timeout');
    if (error instanceof TypeError) throw new Error('network_error');
    throw error;
  } finally {
    window.clearTimeout(timeout);
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
  return answerCandidates(word).some((candidate) => normalizedInput === normalizeAnswer(candidate));
}

function makeDeck(words) {
  return shuffle(words.map((word) => word.id));
}

function authMessage(error) {
  const map = {
    invalid_username: '아이디는 영문 소문자, 숫자, ., _, - 조합 3~24자로 입력해주세요.',
    invalid_password: '비밀번호는 8자 이상으로 입력해주세요.',
    invalid_display_name: '닉네임을 1~30자로 입력해주세요.',
    invalid_real_name: '실명을 2~30자로 입력해주세요.',
    invalid_birth_date: '생년월일을 올바르게 입력해주세요.',
    invalid_preferred_language: '학습 언어를 다시 선택해주세요.',
    username_taken: '이미 사용 중인 아이디입니다.',
    invalid_credentials: '아이디 또는 비밀번호가 맞지 않습니다.',
    missing_token: '로그인이 필요합니다.',
    invalid_token: '로그인이 만료되었습니다. 다시 로그인해주세요.',
    admin_required: '관리자 권한이 필요합니다.',
    request_timeout: '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.',
    network_error: '서버에 연결하지 못했습니다. 새로고침 후 다시 시도해주세요.',
    api_error: '서버 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
  };
  return map[error?.message] || '처리 중 문제가 발생했습니다.';
}

export default function App() {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [examAnswer, setExamAnswer] = useState('');
  const [examFeedback, setExamFeedback] = useState(null);
  const [progress, setProgress] = useState(loadProgress);
  const [auth, setAuth] = useState(loadAuth);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState(emptyAuthForm);
  const [authStatus, setAuthStatus] = useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [adminView, setAdminView] = useState('admin');
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminScores, setAdminScores] = useState([]);
  const [selectedAdminUser, setSelectedAdminUser] = useState(null);
  const [adminStatus, setAdminStatus] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const isLoggedIn = Boolean(auth?.token && auth?.user);

  useEffect(() => {
    let cancelled = false;
    if (!auth?.token) {
      setAuthChecked(true);
      return () => { cancelled = true; };
    }
    setAuthChecked(false);
    api('/me', { token: auth.token })
      .then((data) => {
        if (cancelled) return;
        const refreshedAuth = { ...auth, user: { ...auth.user, ...data.user } };
        setAuth(refreshedAuth);
        if (data.user?.role === 'admin') setAdminView('admin');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401) setAuth(null);
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token]);

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    setLoading(true);
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
  }, [isLoggedIn]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    if (auth?.token) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    else localStorage.removeItem(AUTH_KEY);
  }, [auth]);

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
  const examTotal = progress.examCorrect + progress.examWrong;
  const isAdmin = auth?.user?.role === 'admin';

  async function refreshLeaderboard(language = progress.filter) {
    if (!isLoggedIn) {
      setLeaderboard([]);
      return;
    }
    setLeaderboardLoading(true);
    try {
      const query = language === 'all' ? '' : `?language=${language}`;
      const data = await api(`/leaderboard${query}`);
      setLeaderboard(data.leaderboard ?? []);
    } catch {
      setSyncStatus('랭킹을 불러오지 못했습니다.');
    } finally {
      setLeaderboardLoading(false);
    }
  }

  useEffect(() => {
    if (isLoggedIn) refreshLeaderboard(progress.filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.filter, isLoggedIn]);

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
    if (filter === progress.filter) return;
    setFlipped(false);
    setExamAnswer('');
    setExamFeedback(null);
    setProgress((prev) => ({ ...prev, filter, deck: rebuildDeck({ filter }), deckCursor: 0, updatedAt: new Date().toISOString() }));
  }

  function changeMode(mode) {
    if (mode === progress.mode) return;
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

  async function handleAuth(event) {
    event.preventDefault();
    setAuthStatus('처리 중입니다...');
    try {
      if (authMode === 'register' && authForm.password !== authForm.passwordConfirm) {
        setAuthStatus('비밀번호 확인이 맞지 않습니다.');
        return;
      }
      const payload = authMode === 'register'
        ? {
            username: authForm.username,
            password: authForm.password,
            displayName: authForm.displayName,
            realName: authForm.realName,
            birthDate: authForm.birthDate,
            preferredLanguage: authForm.preferredLanguage,
          }
        : { username: authForm.username, password: authForm.password };
      const data = await api(authMode === 'register' ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setAuth(data);
      if (data.user?.role === 'admin') setAdminView('admin');
      setAuthStatus(authMode === 'register' ? '회원가입과 로그인이 완료되었습니다.' : '로그인되었습니다.');
      setAuthForm(emptyAuthForm);
      if (data.user?.preferredLanguage) changeFilter(data.user.preferredLanguage);
    } catch (err) {
      setAuthStatus(authMessage(err));
    }
  }

  function logout() {
    setAuth(null);
    setAuthStatus('로그아웃되었습니다.');
  }

  async function loadAdminUsers() {
    if (!auth?.token || !isAdmin) return;
    setAdminLoading(true);
    setAdminStatus('사용자 목록을 불러오는 중입니다...');
    try {
      const data = await api('/admin/users', { token: auth.token });
      setAdminUsers(data.users ?? []);
      setAdminStatus('사용자 목록을 불러왔습니다.');
    } catch (err) {
      setAdminStatus(authMessage(err));
      if (err.status === 401) setAuth(null);
    } finally {
      setAdminLoading(false);
    }
  }

  async function loadAdminScores(user) {
    if (!auth?.token || !isAdmin || !user) return;
    setSelectedAdminUser(user);
    setAdminScores([]);
    setAdminStatus(`${user.display_name || user.username} 점수 기록을 불러오는 중입니다...`);
    try {
      const data = await api(`/admin/users/${user.id}/scores`, { token: auth.token });
      setAdminScores(data.scores ?? []);
      setAdminStatus('점수 기록을 불러왔습니다.');
    } catch (err) {
      setAdminStatus(authMessage(err));
    }
  }

  async function setUserDisabled(user, disabled) {
    if (!auth?.token || !isAdmin || !user) return;
    setAdminStatus(disabled ? '사용자를 비활성화하는 중입니다...' : '사용자 비활성화를 해제하는 중입니다...');
    try {
      await api(`/admin/users/${user.id}/disabled`, {
        method: 'PATCH',
        token: auth.token,
        body: JSON.stringify({ disabled }),
      });
      await loadAdminUsers();
    } catch (err) {
      setAdminStatus(authMessage(err));
    }
  }

  useEffect(() => {
    if (isAdmin && adminView === 'admin') loadAdminUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, adminView]);

  async function submitScore() {
    if (!auth?.token) {
      setSyncStatus('점수를 저장하려면 로그인이 필요합니다.');
      return;
    }
    if (!examTotal) {
      setSyncStatus('시험모드에서 최소 1문제 이상 풀어야 점수를 저장할 수 있습니다.');
      return;
    }
    setSyncStatus('점수를 저장 중입니다...');
    try {
      await api('/scores', {
        method: 'POST',
        token: auth.token,
        body: JSON.stringify({ correctCount: progress.examCorrect, wrongCount: progress.examWrong, languageFilter: progress.filter }),
      });
      setSyncStatus('점수를 저장했습니다. 랭킹을 새로고침했습니다.');
      await refreshLeaderboard(progress.filter);
    } catch (err) {
      setSyncStatus(authMessage(err));
      if (err.status === 401) setAuth(null);
    }
  }

  function resetProgress() {
    localStorage.removeItem(STORAGE_KEY);
    setProgress({ ...emptyProgress, deck: makeDeck(filteredWords) });
    setFlipped(false);
    setExamAnswer('');
    setExamFeedback(null);
  }


  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_35%),linear-gradient(135deg,#f8fafc,#eef2ff)] px-5 py-8 text-slate-900">
        <section className="rounded-[2rem] border border-white/70 bg-white/85 p-7 text-center shadow-xl shadow-indigo-100/60 backdrop-blur">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-indigo-500">Flashcard Study</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight">로그인 상태 확인 중</h1>
          <p className="mt-3 text-sm text-slate-600">서버에서 권한을 다시 확인하고 있습니다.</p>
        </section>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_35%),linear-gradient(135deg,#f8fafc,#eef2ff)] px-5 py-8 text-slate-900">
        <section className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white/85 p-7 shadow-xl shadow-indigo-100/60 backdrop-blur">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-indigo-500">Flashcard Study</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">로그인 후 이용하세요</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">영어/일본어 단어 학습, 시험 점수 저장, 랭킹 조회는 로그인한 사용자만 사용할 수 있습니다.</p>

          <form onSubmit={handleAuth} className="mt-6 space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 text-sm font-bold">
              <button type="button" onClick={() => setAuthMode('login')} className={`rounded-xl py-2 ${authMode === 'login' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>로그인</button>
              <button type="button" onClick={() => setAuthMode('register')} className={`rounded-xl py-2 ${authMode === 'register' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>회원가입</button>
            </div>
            <input value={authForm.username} onChange={(e) => setAuthForm((f) => ({ ...f, username: e.target.value }))} placeholder="아이디" autoComplete="username" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
            <input value={authForm.password} onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))} placeholder="비밀번호" type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
            {authMode === 'register' && (
              <>
                <input value={authForm.passwordConfirm} onChange={(e) => setAuthForm((f) => ({ ...f, passwordConfirm: e.target.value }))} placeholder="비밀번호 확인" type="password" autoComplete="new-password" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
                <input value={authForm.displayName} onChange={(e) => setAuthForm((f) => ({ ...f, displayName: e.target.value }))} placeholder="닉네임 / 랭킹 표시 이름" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
                <input value={authForm.realName} onChange={(e) => setAuthForm((f) => ({ ...f, realName: e.target.value }))} placeholder="실명 / 관리자 확인용" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
                <input value={authForm.birthDate} onChange={(e) => setAuthForm((f) => ({ ...f, birthDate: e.target.value }))} type="date" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
                <select value={authForm.preferredLanguage} onChange={(e) => setAuthForm((f) => ({ ...f, preferredLanguage: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400">
                  <option value="all">영어 + 일본어</option>
                  <option value="en">영어</option>
                  <option value="ja">일본어</option>
                </select>
                <p className="rounded-2xl bg-indigo-50 p-3 text-xs leading-5 text-indigo-800">실명과 생년월일은 관리자 확인용으로만 사용하며, 랭킹에는 닉네임만 표시됩니다.</p>
              </>
            )}
            <button type="submit" className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800">{authMode === 'register' ? '회원가입 후 시작하기' : '로그인하고 시작하기'}</button>
            {authStatus && <p className="text-sm font-semibold text-slate-600">{authStatus}</p>}
          </form>
        </section>
      </main>
    );
  }


  if (isAdmin && adminView === 'admin') {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_35%),linear-gradient(135deg,#f8fafc,#eef2ff)] px-5 py-8 text-slate-900">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.35em] text-indigo-500">Admin Dashboard</p>
                <h1 className="mt-3 text-4xl font-black tracking-tight">단어 학습 관리자</h1>
                <p className="mt-2 text-slate-600">회원 정보와 점수 기록을 확인하고, 필요하면 계정을 비활성화할 수 있습니다.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAdminView('learn')} className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white">학습 페이지</button>
                <button type="button" onClick={logout} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">로그아웃</button>
              </div>
            </div>
          </header>

          <section className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black">사용자 목록</h2>
              <button type="button" onClick={loadAdminUsers} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">새로고침</button>
            </div>
            {adminStatus && <p className="mt-3 text-sm font-semibold text-slate-600">{adminStatus}</p>}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[920px] border-separate border-spacing-y-2 text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3">아이디</th><th className="px-3">닉네임</th><th className="px-3">실명</th><th className="px-3">생년월일</th><th className="px-3">언어</th><th className="px-3">역할</th><th className="px-3">점수</th><th className="px-3">상태</th><th className="px-3">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {adminLoading && <tr><td colSpan="9" className="rounded-2xl bg-slate-50 p-4 text-center text-slate-500">불러오는 중입니다...</td></tr>}
                  {!adminLoading && adminUsers.map((user) => (
                    <tr key={user.id} className="bg-slate-50">
                      <td className="rounded-l-2xl px-3 py-3 font-bold">{user.username}</td>
                      <td className="px-3 py-3">{user.display_name}</td>
                      <td className="px-3 py-3">{user.real_name}</td>
                      <td className="px-3 py-3">{user.birth_date ? new Date(user.birth_date).toLocaleDateString('ko-KR') : '-'}</td>
                      <td className="px-3 py-3">{user.preferred_language}</td>
                      <td className="px-3 py-3">{user.role}</td>
                      <td className="px-3 py-3">최고 {user.best_correct ?? 0} / {user.best_accuracy ?? 0}%</td>
                      <td className="px-3 py-3">{user.disabled_at ? '비활성' : '정상'}</td>
                      <td className="rounded-r-2xl px-3 py-3">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => loadAdminScores(user)} className="rounded-xl bg-indigo-50 px-3 py-2 font-bold text-indigo-700">점수</button>
                          {user.role !== 'admin' && <button type="button" onClick={() => setUserDisabled(user, !user.disabled_at)} className="rounded-xl bg-rose-50 px-3 py-2 font-bold text-rose-700">{user.disabled_at ? '해제' : '비활성'}</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {selectedAdminUser && (
            <section className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur">
              <h2 className="text-xl font-black">{selectedAdminUser.display_name} 점수 기록</h2>
              <div className="mt-4 grid gap-2">
                {adminScores.length === 0 && <p className="text-sm text-slate-500">저장된 점수 기록이 없습니다.</p>}
                {adminScores.map((score) => (
                  <div key={score.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                    <span>{new Date(score.submitted_at).toLocaleString('ko-KR')}</span>
                    <span>{score.language_filter} · 정답 {score.correct_count} / 오답 {score.wrong_count}</span>
                    <span className="font-black text-indigo-600">정답률 {score.accuracy}%</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    );
  }


  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_35%),linear-gradient(135deg,#f8fafc,#eef2ff)] px-5 py-8 text-slate-900">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-6">
          <header className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-sm backdrop-blur">
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-indigo-500">Flashcard Study</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">영어/일본어 단어 학습</h1>
            <p className="mt-3 text-slate-600">학습모드로 뜻을 확인하고, 시험모드 점수를 계정별 랭킹에 저장할 수 있습니다.</p>
          </header>

          <div className="flex flex-wrap gap-2">
            {[["learn", "학습모드"], ["exam", "시험모드"]].map(([value, label]) => (
              <button key={value} type="button" onClick={() => changeMode(value)} className={`rounded-full px-5 py-2 text-sm font-bold transition ${progress.mode === value ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{label}</button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {[["all", "전체"], ["en", "영어"], ["ja", "일본어"]].map(([value, label]) => (
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
          <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black">계정</h2>
              {auth?.user && <div className="flex gap-2">{isAdmin && <button type="button" onClick={() => setAdminView('admin')} className="text-sm font-bold text-indigo-600 hover:text-indigo-800">관리자</button>}<button type="button" onClick={logout} className="text-sm font-bold text-slate-500 hover:text-slate-900">로그아웃</button></div>}
            </div>
            {auth?.user ? (
              <div className="mt-4 rounded-2xl bg-indigo-50 p-4 text-sm text-indigo-900">
                <p className="font-black">{auth.user.displayName}님 로그인 중</p>
                <p className="mt-1">학습 언어: {auth.user.preferredLanguage === 'ja' ? '일본어' : auth.user.preferredLanguage === 'en' ? '영어' : '전체'}</p>
                <p className="mt-2 text-xs text-indigo-700">실명/생년월일은 관리자 확인용이며 랭킹에는 표시되지 않습니다.</p>
              </div>
            ) : (
              <form onSubmit={handleAuth} className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 text-sm font-bold">
                  <button type="button" onClick={() => setAuthMode('login')} className={`rounded-xl py-2 ${authMode === 'login' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>로그인</button>
                  <button type="button" onClick={() => setAuthMode('register')} className={`rounded-xl py-2 ${authMode === 'register' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>회원가입</button>
                </div>
                <input value={authForm.username} onChange={(e) => setAuthForm((f) => ({ ...f, username: e.target.value }))} placeholder="아이디" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
                <input value={authForm.password} onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))} placeholder="비밀번호" type="password" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
                {authMode === 'register' && (
                  <>
                    <input value={authForm.passwordConfirm} onChange={(e) => setAuthForm((f) => ({ ...f, passwordConfirm: e.target.value }))} placeholder="비밀번호 확인" type="password" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
                    <input value={authForm.displayName} onChange={(e) => setAuthForm((f) => ({ ...f, displayName: e.target.value }))} placeholder="닉네임 / 랭킹 표시 이름" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
                    <input value={authForm.realName} onChange={(e) => setAuthForm((f) => ({ ...f, realName: e.target.value }))} placeholder="실명 / 관리자 확인용" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
                    <input value={authForm.birthDate} onChange={(e) => setAuthForm((f) => ({ ...f, birthDate: e.target.value }))} type="date" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
                    <select value={authForm.preferredLanguage} onChange={(e) => setAuthForm((f) => ({ ...f, preferredLanguage: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400">
                      <option value="all">영어 + 일본어</option>
                      <option value="en">영어</option>
                      <option value="ja">일본어</option>
                    </select>
                    <p className="text-xs leading-5 text-slate-500">실명과 생년월일은 관리자 확인용으로만 사용하며, 랭킹에는 닉네임만 표시됩니다.</p>
                  </>
                )}
                <button type="submit" className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">{authMode === 'register' ? '회원가입' : '로그인'}</button>
                {authStatus && <p className="text-sm font-semibold text-slate-600">{authStatus}</p>}
              </form>
            )}
          </section>

          <ProgressBar current={answeredCount} total={filteredWords.length} correct={progress.correct} wrong={progress.wrong} examCorrect={progress.examCorrect} examWrong={progress.examWrong} />

          <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
            <h2 className="text-lg font-black">시험 점수 저장</h2>
            <p className="mt-2 text-sm text-slate-500">시험모드 결과 {progress.examCorrect}정답 / {progress.examWrong}오답을 현재 필터 랭킹에 저장합니다.</p>
            <button type="button" onClick={submitScore} className="mt-4 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-700">랭킹에 점수 저장</button>
            {syncStatus && <p className="mt-3 text-sm font-semibold text-slate-600">{syncStatus}</p>}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-black">전체 랭킹</h2>
              <button type="button" onClick={() => refreshLeaderboard(progress.filter)} className="text-sm font-bold text-indigo-600">새로고침</button>
            </div>
            <div className="mt-4 space-y-2">
              {leaderboardLoading && <p className="text-sm text-slate-500">랭킹을 불러오는 중입니다...</p>}
              {!leaderboardLoading && leaderboard.length === 0 && <p className="text-sm text-slate-500">아직 저장된 점수가 없습니다.</p>}
              {leaderboard.map((row, index) => (
                <div key={`${row.display_name}-${row.last_submitted_at}`} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                  <div>
                    <p className="font-black text-slate-900">{index + 1}. {row.display_name}</p>
                    <p className="text-xs text-slate-500">도전 {row.attempts}회</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-indigo-600">{row.best_correct}개</p>
                    <p className="text-xs text-slate-500">정답률 {row.best_accuracy}%</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
            <h2 className="text-lg font-black">학습 상태</h2>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex justify-between"><dt>모드</dt><dd>{isExamMode ? '시험모드' : '학습모드'}</dd></div>
              <div className="flex justify-between"><dt>현재 위치</dt><dd>{filteredWords.length ? currentIndex + 1 : 0} / {filteredWords.length}</dd></div>
              <div className="flex justify-between"><dt>최근 저장</dt><dd>{progress.updatedAt ? new Date(progress.updatedAt).toLocaleString('ko-KR') : '아직 없음'}</dd></div>
            </dl>
            <button type="button" onClick={() => setProgress((prev) => ({ ...prev, deck: makeDeck(filteredWords), deckCursor: 0, updatedAt: new Date().toISOString() }))} className="mt-5 w-full rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100">랜덤 순서 다시 섞기</button>
            <button type="button" onClick={resetProgress} className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50">진도 초기화</button>
          </section>
        </aside>
      </div>
    </main>
  );
}
