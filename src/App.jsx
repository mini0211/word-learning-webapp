import { useEffect, useMemo, useState } from 'react';
import WordCard, { SpeakButton } from './components/WordCard.jsx';
import ProgressBar from './components/ProgressBar.jsx';

const STORAGE_KEY = 'wordLearningProgress.v2';
const AUTH_KEY = 'wordLearningAuth.v1';
const AI_ACCEPTED_KEY = 'wordLearningAiAcceptedAnswers.v1';
const API_BASE = 'https://lumi-storage.taild1716c.ts.net';

const emptyProgress = {
  mode: 'learn',
  filter: 'en',
  deck: [],
  deckCursor: 0,
  results: {},
  wordStats: {},
  studyFilter: 'all',
  correct: 0,
  wrong: 0,
  examCorrect: 0,
  examWrong: 0,
  examLimit: 25,
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
    const normalizedFilter = ['en', 'ja'].includes(saved?.filter) ? saved.filter : 'en';
    return { ...emptyProgress, ...saved, filter: normalizedFilter, results: saved?.results ?? {}, wordStats: saved?.wordStats ?? {}, deck: saved?.deck ?? [] };
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

function koreanLooseForms(value) {
  const normalized = normalizeAnswer(value);
  const forms = new Set([normalized]);
  if (/^[가-힣]{2,}$/.test(normalized)) {
    if (normalized.endsWith('다') && normalized.length >= 3) forms.add(normalized.slice(0, -1));
    if (normalized.endsWith('기') && normalized.length >= 3) forms.add(normalized.slice(0, -1));
    if (normalized.endsWith('하다') && normalized.length >= 4) forms.add(normalized.slice(0, -2));
    if (normalized.endsWith('하기') && normalized.length >= 4) forms.add(normalized.slice(0, -2));
  }
  return [...forms].filter((form) => form.length >= 2);
}

function isAnswerMatch(input, candidate) {
  const normalizedInput = normalizeAnswer(input);
  const normalizedCandidate = normalizeAnswer(candidate);
  if (!normalizedInput || !normalizedCandidate) return false;
  if (normalizedInput === normalizedCandidate) return true;
  const inputTokens = String(input ?? '').split(/[\s.,!?，、。·・~`'"“”‘’()\[\]{}:;/_\-]+/).map(normalizeAnswer).filter(Boolean);
  if (inputTokens.includes(normalizedCandidate)) return true;
  const inputForms = new Set([...koreanLooseForms(input), ...inputTokens.flatMap(koreanLooseForms)]);
  if (koreanLooseForms(candidate).some((form) => inputForms.has(form))) return true;

  // 제한적 부분 일치: 너무 짧은 답은 오답 과잉 인정 위험이 커서 제외한다.
  if (normalizedInput.length < 3 || normalizedCandidate.length < 3) return false;
  return normalizedCandidate.includes(normalizedInput) || normalizedInput.includes(normalizedCandidate);
}

function judgeAnswer(input, word) {
  if (!input || !word) return false;
  return answerCandidates(word).some((candidate) => isAnswerMatch(input, candidate));
}


function initialWordStats() {
  return { seen: 0, correct: 0, wrong: 0, streak: 0, lastResult: null, lastAnswer: '', lastAiReason: '', updatedAt: null };
}

function nextWordStats(current, isCorrect, answer = '', aiGrade = null) {
  const prev = { ...initialWordStats(), ...(current ?? {}) };
  return {
    ...prev,
    seen: prev.seen + 1,
    correct: prev.correct + (isCorrect ? 1 : 0),
    wrong: prev.wrong + (isCorrect ? 0 : 1),
    streak: isCorrect ? Math.max(0, prev.streak) + 1 : Math.min(0, prev.streak) - 1,
    lastResult: isCorrect ? 'correct' : 'wrong',
    lastAnswer: String(answer ?? '').slice(0, 80),
    lastAiReason: aiGrade?.reason || aiGrade?.explanation || '',
    updatedAt: new Date().toISOString(),
  };
}

function getWordStatus(word, statsMap = {}) {
  const stats = { ...initialWordStats(), ...(statsMap[word?.id] ?? {}) };
  if (!word?.id || stats.seen === 0) return 'new';
  if (stats.wrong >= 2 || stats.streak <= -2) return 'frequentWrong';
  if (stats.lastResult === 'wrong' || stats.wrong > 0) return 'review';
  if (stats.correct >= 3 || stats.streak >= 3) return 'mastered';
  return 'learning';
}

function statusLabel(status) {
  const labels = {
    all: '전체 상태',
    reviewAll: '오답 전체',
    new: '처음 봄',
    learning: '학습 중',
    review: '오답 복습',
    frequentWrong: '자주 틀림',
    mastered: '익숙함',
  };
  return labels[status] || labels.all;
}

function aiReasonText(feedback) {
  const grade = feedback?.aiGrade;
  if (!grade) {
    if (feedback?.source === 'local-rule') return '기본 정답 목록과 일치해서 정답 처리했습니다.';
    if (feedback?.source === 'ai-local-cache') return '이전에 AI가 정답으로 인정한 답안이라 다시 인정했습니다.';
    return '';
  }
  if (grade.reason || grade.explanation) return grade.reason || grade.explanation;
  if (grade.verdict === 'correct') return '뜻이 정답과 충분히 같아서 정답으로 인정했습니다.';
  if (grade.verdict === 'partial') return '의미는 일부 가깝지만 정답으로 인정하기에는 부족합니다.';
  if (grade.verdict === 'wrong') return '입력한 뜻이 정답 의미와 다르다고 판단했습니다.';
  if (grade.error) return 'AI 확인에 실패해서 기본 채점 결과를 사용했습니다.';
  return 'AI가 추가로 의미를 확인했습니다.';
}

function aiCacheKey(wordId, answer) {
  return `${wordId}:${normalizeAnswer(answer)}`;
}

function loadAcceptedAiAnswers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AI_ACCEPTED_KEY));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function isAcceptedByAiCache(word, answer) {
  if (!word?.id) return false;
  const cache = loadAcceptedAiAnswers();
  const entry = cache[aiCacheKey(word.id, answer)];
  if (!entry) return false;
  if (entry.expiresAt && new Date(entry.expiresAt).getTime() < Date.now()) return false;
  return entry.verdict === 'correct' && Number(entry.confidence || 0) >= 0.85;
}

function rememberAiAcceptedAnswer(word, answer, grade) {
  if (!word?.id) return;
  const cache = loadAcceptedAiAnswers();
  const key = aiCacheKey(word.id, answer);
  cache[key] = {
    wordId: word.id,
    answer: normalizeAnswer(answer),
    verdict: grade.verdict,
    confidence: grade.confidence,
    source: grade.source || 'ai',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString(),
  };
  const entries = Object.entries(cache).slice(-500);
  localStorage.setItem(AI_ACCEPTED_KEY, JSON.stringify(Object.fromEntries(entries)));
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
    invalid_request_type: '요청 종류를 다시 선택해주세요.',
    invalid_request_message: '요청 내용은 1~1000자로 입력해주세요.',
    invalid_request_status: '요청 상태를 다시 선택해주세요.',
    invalid_question_count: '시험 문제 수를 다시 선택해주세요.',
    invalid_score: '선택한 문제 수를 모두 푼 뒤 저장해주세요.',
    invalid_current_password: '현재 비밀번호가 맞지 않습니다.',
    account_locked: '로그인 실패가 여러 번 발생해 계정이 잠시 잠겼습니다. 10분 후 다시 시도해주세요.',
    use_own_password_change: '본인 비밀번호는 내 정보에서 변경해주세요.',
  };
  return map[error?.message] || '처리 중 문제가 발생했습니다.';
}

function formatBirthDate(value) {
  if (!value) return '';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return value;
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export default function App() {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [examAnswer, setExamAnswer] = useState('');
  const [examFeedback, setExamFeedback] = useState(null);
  const [aiChecking, setAiChecking] = useState(false);
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
  const [requestForm, setRequestForm] = useState({ type: 'suggestion', message: '' });
  const [requestStatus, setRequestStatus] = useState('');
  const [adminRequests, setAdminRequests] = useState([]);
  const [selectedRequestsUser, setSelectedRequestsUser] = useState(null);
  const [adminStatus, setAdminStatus] = useState('');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordStatus, setPasswordStatus] = useState('');
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [resetPasswordForm, setResetPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [resetPasswordStatus, setResetPasswordStatus] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeView, setActiveView] = useState('learn');
  const [menuOpen, setMenuOpen] = useState(false);
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

  const activeLanguage = ['en', 'ja'].includes(progress.filter) ? progress.filter : 'en';

  const languageWords = useMemo(() => words.filter((word) => word.lang === activeLanguage), [words, activeLanguage]);

  const filteredWords = useMemo(() => {
    const studyFilter = progress.studyFilter ?? 'all';
    if (studyFilter === 'all') return languageWords;
    if (studyFilter === 'reviewAll') return languageWords.filter((word) => ['review', 'frequentWrong'].includes(getWordStatus(word, progress.wordStats)));
    return languageWords.filter((word) => getWordStatus(word, progress.wordStats) === studyFilter);
  }, [languageWords, progress.studyFilter, progress.wordStats]);

  const wordById = useMemo(() => new Map(words.map((word) => [word.id, word])), [words]);

  const validDeck = useMemo(() => {
    const validIds = new Set(filteredWords.map((word) => word.id));
    return progress.deck.filter((id) => validIds.has(id));
  }, [filteredWords, progress.deck]);

  const currentDeck = validDeck.length ? validDeck : makeDeck(filteredWords);
  const currentIndex = currentDeck.length ? progress.deckCursor % currentDeck.length : 0;
  const currentWord = wordById.get(currentDeck[currentIndex]);
  const learningPosition = currentDeck.length ? currentIndex + 1 : 0;
  const answeredCount = Object.keys(progress.results).filter((id) => filteredWords.some((word) => word.id === id)).length;
  const isExamMode = progress.mode === 'exam';
  const examTotal = progress.examCorrect + progress.examWrong;
  const examLimit = [25, 50, 100].includes(Number(progress.examLimit)) ? Number(progress.examLimit) : 25;
  const examCompleted = isExamMode && examTotal >= examLimit;
  const isAdmin = auth?.user?.role === 'admin';
  const statusCounts = useMemo(() => {
    const base = { all: languageWords.length, reviewAll: 0, new: 0, learning: 0, review: 0, frequentWrong: 0, mastered: 0 };
    languageWords.forEach((word) => { base[getWordStatus(word, progress.wordStats)] += 1; });
    base.reviewAll = base.review + base.frequentWrong;
    return base;
  }, [languageWords, progress.wordStats]);
  const reviewCount = statusCounts.reviewAll;

  async function refreshLeaderboard(language = activeLanguage) {
    if (!isLoggedIn) {
      setLeaderboard([]);
      return;
    }
    setLeaderboardLoading(true);
    try {
      const params = new URLSearchParams({ questionCount: String(examLimit) });
      const normalizedLanguage = ['en', 'ja'].includes(language) ? language : 'en';
      params.set('language', normalizedLanguage);
      const data = await api(`/leaderboard?${params.toString()}`);
      setLeaderboard(data.leaderboard ?? []);
    } catch {
      setSyncStatus('랭킹을 불러오지 못했습니다.');
    } finally {
      setLeaderboardLoading(false);
    }
  }

  useEffect(() => {
    if (isLoggedIn) refreshLeaderboard(activeLanguage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLanguage, progress.examLimit, isLoggedIn]);

  useEffect(() => {
    if (!loading && filteredWords.length && !validDeck.length) {
      setProgress((prev) => ({ ...prev, deck: makeDeck(filteredWords), deckCursor: 0, updatedAt: new Date().toISOString() }));
    }
  }, [loading, filteredWords, validDeck.length]);

  function rebuildDeck(overrides = {}) {
    const targetFilter = ['en', 'ja'].includes(overrides.filter ?? progress.filter) ? (overrides.filter ?? progress.filter) : 'en';
    const targetStudyFilter = overrides.studyFilter ?? progress.studyFilter ?? 'all';
    const byLanguage = words.filter((word) => word.lang === targetFilter);
    const targetWords = targetStudyFilter === 'all'
      ? byLanguage
      : targetStudyFilter === 'reviewAll'
        ? byLanguage.filter((word) => ['review', 'frequentWrong'].includes(getWordStatus(word, progress.wordStats)))
        : byLanguage.filter((word) => getWordStatus(word, progress.wordStats) === targetStudyFilter);
    return makeDeck(targetWords);
  }

  function changeStudyFilter(studyFilter) {
    if (studyFilter === (progress.studyFilter ?? 'all')) return;
    setFlipped(false);
    setExamAnswer('');
    setExamFeedback(null);
    setProgress((prev) => ({ ...prev, studyFilter, deck: rebuildDeck({ studyFilter }), deckCursor: 0, updatedAt: new Date().toISOString() }));
  }

  function startWrongReview() {
    const target = 'reviewAll';
    setActiveView('exam');
    setFlipped(false);
    setExamAnswer('');
    setExamFeedback(null);
    setProgress((prev) => ({ ...prev, mode: 'exam', studyFilter: target, deck: rebuildDeck({ studyFilter: target }), deckCursor: 0, examCorrect: 0, examWrong: 0, results: {}, updatedAt: new Date().toISOString() }));
  }

  function changeFilter(filter) {
    const nextFilter = ['en', 'ja'].includes(filter) ? filter : 'en';
    if (nextFilter === activeLanguage) return;
    setFlipped(false);
    setExamAnswer('');
    setExamFeedback(null);
    setProgress((prev) => ({ ...prev, filter: nextFilter, deck: rebuildDeck({ filter: nextFilter }), deckCursor: 0, updatedAt: new Date().toISOString() }));
  }

  function changeMode(mode) {
    if (mode === progress.mode) return;
    setFlipped(false);
    setExamAnswer('');
    setExamFeedback(null);
    setProgress((prev) => ({ ...prev, mode, deck: rebuildDeck(), deckCursor: 0, examCorrect: 0, examWrong: 0, results: {}, updatedAt: new Date().toISOString() }));
  }

  function changeExamLimit(limit) {
    if (limit === examLimit) return;
    setFlipped(false);
    setExamAnswer('');
    setExamFeedback(null);
    setProgress((prev) => ({ ...prev, examLimit: limit, deck: rebuildDeck(), deckCursor: 0, examCorrect: 0, examWrong: 0, results: {}, updatedAt: new Date().toISOString() }));
  }

  function navigate(view) {
    setMenuOpen(false);
    if (view === 'admin') {
      setAdminView('admin');
      return;
    }
    if (view === 'learn' || view === 'exam') {
      changeMode(view);
    }
    setActiveView(view);
  }

  function moveNext() {
    if (isExamMode && examTotal >= examLimit) {
      setExamFeedback(null);
      return;
    }
    setProgress((prev) => {
      const nextDeck = currentIndex >= currentDeck.length - 1 ? makeDeck(filteredWords) : currentDeck;
      const nextCursor = currentIndex >= currentDeck.length - 1 ? 0 : currentIndex + 1;
      return { ...prev, deck: nextDeck, deckCursor: nextCursor, updatedAt: new Date().toISOString() };
    });
    setFlipped(false);
    setExamAnswer('');
    setExamFeedback(null);
    setAiChecking(false);
  }

  function answer(result) {
    if (!currentWord) return;
    const previous = progress.results[currentWord.id];
    const nextResults = { ...progress.results, [currentWord.id]: result };
    const deltaCorrect = (result === 'correct' ? 1 : 0) - (previous === 'correct' ? 1 : 0);
    const deltaWrong = (result === 'wrong' ? 1 : 0) - (previous === 'wrong' ? 1 : 0);

    // 뒷면을 본 상태에서 다음 단어로 바뀌면 다음 카드의 정답이 순간적으로 보일 수 있어,
    // 먼저 앞면으로 접은 뒤 다음 카드로 이동한다.
    setFlipped(false);
    setProgress((prev) => ({
      ...prev,
      results: nextResults,
      wordStats: { ...prev.wordStats, [currentWord.id]: nextWordStats(prev.wordStats?.[currentWord.id], result === 'correct') },
      correct: Math.max(0, prev.correct + deltaCorrect),
      wrong: Math.max(0, prev.wrong + deltaWrong),
      updatedAt: new Date().toISOString(),
    }));
    setTimeout(moveNext, flipped ? 180 : 0);
  }

  async function submitExam(event) {
    event.preventDefault();
    if (!currentWord || examFeedback || examCompleted || aiChecking) return;

    const localCorrect = judgeAnswer(examAnswer, currentWord);
    let correct = localCorrect || isAcceptedByAiCache(currentWord, examAnswer);
    let aiGrade = null;

    if (!correct && auth?.token) {
      setAiChecking(true);
      try {
        aiGrade = await api('/grade-answer', {
          method: 'POST',
          token: auth.token,
          timeoutMs: 12000,
          body: JSON.stringify({ word: currentWord, answer: examAnswer }),
        });
        correct = Boolean(aiGrade.accepted);
        if (correct && aiGrade.cacheable) rememberAiAcceptedAnswer(currentWord, examAnswer, aiGrade);
      } catch (err) {
        aiGrade = { source: 'fallback:client_error', error: err.message };
        if (err.status === 401) setAuth(null);
      } finally {
        setAiChecking(false);
      }
    }

    const result = correct ? 'correct' : 'wrong';
    const previous = progress.results[currentWord.id];
    const nextResults = { ...progress.results, [currentWord.id]: result };
    const deltaCorrect = (result === 'correct' ? 1 : 0) - (previous === 'correct' ? 1 : 0);
    const deltaWrong = (result === 'wrong' ? 1 : 0) - (previous === 'wrong' ? 1 : 0);

    setProgress((prev) => ({
      ...prev,
      results: nextResults,
      wordStats: { ...prev.wordStats, [currentWord.id]: nextWordStats(prev.wordStats?.[currentWord.id], correct, examAnswer, aiGrade) },
      correct: Math.max(0, prev.correct + deltaCorrect),
      wrong: Math.max(0, prev.wrong + deltaWrong),
      examCorrect: prev.examCorrect + (correct ? 1 : 0),
      examWrong: prev.examWrong + (correct ? 0 : 1),
      updatedAt: new Date().toISOString(),
    }));
    setExamFeedback({
      correct,
      answer: currentWord.meaning,
      candidates: answerCandidates(currentWord),
      aiGrade,
      source: localCorrect ? 'local-rule' : correct && !aiGrade ? 'ai-local-cache' : aiGrade?.source,
      reason: aiReasonText({ aiGrade, source: localCorrect ? 'local-rule' : correct && !aiGrade ? 'ai-local-cache' : aiGrade?.source }),
    });
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
      if (['en', 'ja'].includes(data.user?.preferredLanguage)) changeFilter(data.user.preferredLanguage);
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


  async function loadAdminRequests(user) {
    if (!auth?.token || !isAdmin || !user) return;
    setSelectedRequestsUser(user);
    setAdminRequests([]);
    setAdminStatus(`${user.display_name || user.username} 요청사항을 불러오는 중입니다...`);
    try {
      const data = await api(`/admin/users/${user.id}/requests`, { token: auth.token });
      setAdminRequests(data.requests ?? []);
      setAdminStatus('요청사항을 불러왔습니다.');
    } catch (err) {
      setAdminStatus(authMessage(err));
    }
  }

  async function updateAdminRequestStatus(request, status) {
    if (!auth?.token || !isAdmin || !request) return;
    setAdminStatus('요청 상태를 변경하는 중입니다...');
    try {
      await api(`/admin/requests/${request.id}/status`, {
        method: 'PATCH',
        token: auth.token,
        body: JSON.stringify({ status }),
      });
      if (selectedRequestsUser) await loadAdminRequests(selectedRequestsUser);
      await loadAdminUsers();
    } catch (err) {
      setAdminStatus(authMessage(err));
    }
  }

  async function submitRequest(event) {
    event.preventDefault();
    if (!auth?.token) {
      setRequestStatus('로그인이 필요합니다.');
      return;
    }
    const message = requestForm.message.trim();
    if (!message || message.length > 1000) {
      setRequestStatus('요청 내용은 1~1000자로 입력해주세요.');
      return;
    }
    setRequestStatus('관리자에게 보내는 중입니다...');
    try {
      await api('/requests', {
        method: 'POST',
        token: auth.token,
        body: JSON.stringify({ type: requestForm.type, message }),
      });
      setRequestForm({ type: 'suggestion', message: '' });
      setRequestStatus('관리자에게 전달되었습니다.');
    } catch (err) {
      setRequestStatus(authMessage(err));
      if (err.status === 401) setAuth(null);
    }
  }


  async function changeOwnPassword(event) {
    event.preventDefault();
    if (!auth?.token) return;
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordStatus('새 비밀번호 확인이 맞지 않습니다.');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordStatus('새 비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    setPasswordStatus('비밀번호를 변경하는 중입니다...');
    try {
      await api('/me/password', {
        method: 'PATCH',
        token: auth.token,
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }),
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordStatus('비밀번호가 변경되었습니다. 다시 로그인해주세요.');
      setAuth(null);
    } catch (err) {
      setPasswordStatus(authMessage(err));
      if (err.status === 401 && err.message === 'invalid_token') setAuth(null);
    }
  }

  async function resetUserPassword(event) {
    event.preventDefault();
    if (!auth?.token || !isAdmin || !resetPasswordUser) return;
    if (resetPasswordForm.newPassword !== resetPasswordForm.confirmPassword) {
      setResetPasswordStatus('새 비밀번호 확인이 맞지 않습니다.');
      return;
    }
    if (resetPasswordForm.newPassword.length < 8) {
      setResetPasswordStatus('새 비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    setResetPasswordStatus('비밀번호를 초기화하는 중입니다...');
    try {
      await api(`/admin/users/${resetPasswordUser.id}/password-reset`, {
        method: 'PATCH',
        token: auth.token,
        body: JSON.stringify({ newPassword: resetPasswordForm.newPassword }),
      });
      setResetPasswordForm({ newPassword: '', confirmPassword: '' });
      setResetPasswordStatus(`${resetPasswordUser.display_name || resetPasswordUser.username} 비밀번호를 초기화했습니다.`);
      await loadAdminUsers();
    } catch (err) {
      setResetPasswordStatus(authMessage(err));
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
    if (examTotal < examLimit) {
      setSyncStatus(`${examLimit}문제를 모두 푼 뒤 점수를 저장할 수 있습니다.`);
      return;
    }
    setSyncStatus('점수를 저장 중입니다...');
    try {
      await api('/scores', {
        method: 'POST',
        token: auth.token,
        body: JSON.stringify({ correctCount: progress.examCorrect, wrongCount: progress.examWrong, languageFilter: activeLanguage, questionCount: examLimit }),
      });
      setSyncStatus(`${examLimit}문제 시험 점수를 저장했습니다. 랭킹을 새로고침했습니다.`);
      await refreshLeaderboard(activeLanguage);
    } catch (err) {
      setSyncStatus(authMessage(err));
      if (err.status === 401) setAuth(null);
    }
  }

  function resetProgress() {
    localStorage.removeItem(STORAGE_KEY);
    setProgress({ ...emptyProgress, examLimit, deck: makeDeck(filteredWords) });
    setFlipped(false);
    setExamAnswer('');
    setExamFeedback(null);
    setAiChecking(false);
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
                <label className="block text-left text-xs font-black text-slate-500">
                  생년월일
                  <input value={authForm.birthDate} onChange={(e) => setAuthForm((f) => ({ ...f, birthDate: e.target.value }))} type="date" className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:border-indigo-400" />
                </label>
                {authForm.birthDate && <p className="-mt-1 text-left text-xs font-semibold text-indigo-600">선택한 생년월일: {formatBirthDate(authForm.birthDate)}</p>}
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
                <p className="mt-2 text-slate-600">회원 정보, 점수 기록, 건의/요청 쪽지를 확인하고 관리할 수 있습니다.</p>
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
              <table className="w-full min-w-[1060px] border-separate border-spacing-y-2 text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3">아이디</th><th className="px-3">닉네임</th><th className="px-3">실명</th><th className="px-3">생년월일</th><th className="px-3">언어</th><th className="px-3">역할</th><th className="px-3">점수</th><th className="px-3">요청</th><th className="px-3">로그인</th><th className="px-3">상태</th><th className="px-3">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {adminLoading && <tr><td colSpan="11" className="rounded-2xl bg-slate-50 p-4 text-center text-slate-500">불러오는 중입니다...</td></tr>}
                  {!adminLoading && adminUsers.map((user) => (
                    <tr key={user.id} className="bg-slate-50">
                      <td className="rounded-l-2xl px-3 py-3 font-bold">{user.username}</td>
                      <td className="px-3 py-3">{user.display_name}</td>
                      <td className="px-3 py-3">{user.real_name}</td>
                      <td className="px-3 py-3">{user.birth_date ? new Date(user.birth_date).toLocaleDateString('ko-KR') : '-'}</td>
                      <td className="px-3 py-3">{user.preferred_language}</td>
                      <td className="px-3 py-3">{user.role}</td>
                      <td className="px-3 py-3">최고 {user.best_correct ?? 0} / {user.best_accuracy ?? 0}%</td>
                      <td className="px-3 py-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${Number(user.unread_request_count || 0) > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>요청 {user.request_count ?? 0} · 새 {user.unread_request_count ?? 0}</span></td>
                      <td className="px-3 py-3">{user.login_locked_until && new Date(user.login_locked_until).getTime() > Date.now() ? '잠김' : `${user.login_failed_count ?? 0}회 실패`}</td>
                      <td className="px-3 py-3">{user.disabled_at ? '비활성' : '정상'}</td>
                      <td className="rounded-r-2xl px-3 py-3">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => loadAdminScores(user)} className="rounded-xl bg-indigo-50 px-3 py-2 font-bold text-indigo-700">점수</button>
                          <button type="button" onClick={() => loadAdminRequests(user)} className="rounded-xl bg-amber-50 px-3 py-2 font-bold text-amber-700">요청</button>
                          {user.role !== 'admin' && <button type="button" onClick={() => { setResetPasswordUser(user); setResetPasswordStatus(''); setResetPasswordForm({ newPassword: '', confirmPassword: '' }); }} className="rounded-xl bg-violet-50 px-3 py-2 font-bold text-violet-700">비번 초기화</button>}
                          {user.role !== 'admin' && <button type="button" onClick={() => setUserDisabled(user, !user.disabled_at)} className="rounded-xl bg-rose-50 px-3 py-2 font-bold text-rose-700">{user.disabled_at ? '해제' : '비활성'}</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>


          <section className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur">
            <h2 className="text-xl font-black">내 비밀번호 변경</h2>
            <form onSubmit={changeOwnPassword} className="mt-4 grid gap-3 md:grid-cols-3">
              <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((form) => ({ ...form, currentPassword: e.target.value }))} placeholder="현재 비밀번호" autoComplete="current-password" className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
              <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((form) => ({ ...form, newPassword: e.target.value }))} placeholder="새 비밀번호" autoComplete="new-password" className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
              <input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((form) => ({ ...form, confirmPassword: e.target.value }))} placeholder="새 비밀번호 확인" autoComplete="new-password" className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
              <button type="submit" className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white md:col-span-3">내 비밀번호 변경</button>
              {passwordStatus && <p className="text-sm font-semibold text-slate-600 md:col-span-3">{passwordStatus}</p>}
            </form>
          </section>

          {resetPasswordUser && (
            <section className="rounded-3xl border border-violet-100 bg-white/85 p-5 shadow-sm backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-black">{resetPasswordUser.display_name} 비밀번호 초기화</h2>
                <button type="button" onClick={() => setResetPasswordUser(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600">닫기</button>
              </div>
              <form onSubmit={resetUserPassword} className="mt-4 grid gap-3 md:grid-cols-2">
                <input type="password" value={resetPasswordForm.newPassword} onChange={(e) => setResetPasswordForm((form) => ({ ...form, newPassword: e.target.value }))} placeholder="새 비밀번호" autoComplete="new-password" className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400" />
                <input type="password" value={resetPasswordForm.confirmPassword} onChange={(e) => setResetPasswordForm((form) => ({ ...form, confirmPassword: e.target.value }))} placeholder="새 비밀번호 확인" autoComplete="new-password" className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400" />
                <button type="submit" className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-black text-white md:col-span-2">비밀번호 초기화</button>
                {resetPasswordStatus && <p className="text-sm font-semibold text-slate-600 md:col-span-2">{resetPasswordStatus}</p>}
              </form>
            </section>
          )}


          {selectedRequestsUser && (
            <section className="rounded-3xl border border-amber-100 bg-white/85 p-5 shadow-sm backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-black">{selectedRequestsUser.display_name} 요청사항</h2>
                <button type="button" onClick={() => setSelectedRequestsUser(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600">닫기</button>
              </div>
              <div className="mt-4 grid gap-3">
                {adminRequests.length === 0 && <p className="text-sm text-slate-500">보낸 요청사항이 없습니다.</p>}
                {adminRequests.map((request) => (
                  <article key={request.id} className="rounded-2xl bg-amber-50/70 p-4 text-sm text-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-700">{request.type === 'bug' ? '오류' : request.type === 'word' ? '단어 요청' : request.type === 'other' ? '기타' : '건의'}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${request.status === 'unread' ? 'bg-rose-100 text-rose-700' : request.status === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{request.status === 'unread' ? '안 읽음' : request.status === 'done' ? '완료' : '읽음'}</span>
                      </div>
                      <span className="text-xs text-slate-500">{new Date(request.created_at).toLocaleString('ko-KR')}</span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap break-words leading-6">{request.message}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => updateAdminRequestStatus(request, 'read')} className="rounded-xl bg-white px-3 py-2 font-bold text-slate-700">읽음</button>
                      <button type="button" onClick={() => updateAdminRequestStatus(request, 'done')} className="rounded-xl bg-emerald-600 px-3 py-2 font-bold text-white">완료</button>
                      <button type="button" onClick={() => updateAdminRequestStatus(request, 'unread')} className="rounded-xl bg-rose-50 px-3 py-2 font-bold text-rose-700">안 읽음</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {selectedAdminUser && (
            <section className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur">
              <h2 className="text-xl font-black">{selectedAdminUser.display_name} 점수 기록</h2>
              <div className="mt-4 grid gap-2">
                {adminScores.length === 0 && <p className="text-sm text-slate-500">저장된 점수 기록이 없습니다.</p>}
                {adminScores.map((score) => (
                  <div key={score.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                    <span>{new Date(score.submitted_at).toLocaleString('ko-KR')}</span>
                    <span>{score.language_filter} · {score.question_count ?? score.total_count}문제 · 정답 {score.correct_count} / 오답 {score.wrong_count}</span>
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


  const menuItems = [
    { id: 'learn', label: '학습', icon: '📚' },
    { id: 'exam', label: '시험', icon: '📝' },
    { id: 'leaderboard', label: '랭킹', icon: '🏆' },
    { id: 'profile', label: '내 정보', icon: '👤' },
    { id: 'request', label: '관리자에게 건의', icon: '💬' },
    ...(isAdmin ? [{ id: 'admin', label: '관리자 메뉴', icon: '🛠️' }] : []),
  ];

  const activeTitle = menuItems.find((item) => item.id === activeView)?.label ?? '학습';

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_35%),linear-gradient(135deg,#f8fafc,#eef2ff)] px-4 py-5 text-slate-900 sm:px-5 sm:py-8">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1fr_320px]">
        <section className="space-y-5">
          <header className="sticky top-3 z-20 rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur sm:p-6 lg:static">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-indigo-500 sm:text-sm">Flashcard Study</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">{activeTitle}</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">앱 메뉴로 학습, 시험, 랭킹, 내 정보, 건의 화면을 전환합니다.</p>
              </div>
              <button type="button" onClick={() => setMenuOpen(true)} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 lg:hidden" aria-label="메뉴 열기">☰</button>
            </div>
          </header>

          {(activeView === 'learn' || activeView === 'exam') && (
            <>
              <section className="space-y-5 rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur sm:p-6">
                <div className="flex flex-wrap gap-2">
                  {[["learn", "학습모드"], ["exam", "시험모드"]].map(([value, label]) => (
                    <button key={value} type="button" onClick={() => navigate(value)} className={`rounded-full px-5 py-2 text-sm font-bold transition ${progress.mode === value ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{label}</button>
                  ))}
                </div>

                {isExamMode && (
                  <div className="rounded-3xl border border-violet-100 bg-white/80 p-4 shadow-sm">
                    <p className="text-sm font-black text-slate-700">시험 문제 수</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[25, 50, 100].map((limit) => (
                        <button key={limit} type="button" onClick={() => changeExamLimit(limit)} className={`rounded-full px-5 py-2 text-sm font-bold transition ${examLimit === limit ? 'bg-violet-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{limit}문제</button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">문제 수를 바꾸면 현재 시험 진행상황이 초기화됩니다.</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {[["en", "영어"], ["ja", "일본어"]].map(([value, label]) => (
                    <button key={value} type="button" onClick={() => changeFilter(value)} className={`rounded-full px-5 py-2 text-sm font-bold transition ${activeLanguage === value ? 'bg-slate-950 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{label}</button>
                  ))}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-700">학습 상태 필터</p>
                    <button type="button" onClick={startWrongReview} disabled={reviewCount === 0} className="rounded-full bg-rose-500 px-4 py-2 text-sm font-black text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40">오답만 다시 풀기 {reviewCount > 0 ? `(${reviewCount})` : ''}</button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[['all', '전체 상태'], ['reviewAll', '오답 전체'], ['new', '처음 봄'], ['learning', '학습 중'], ['review', '오답 복습'], ['frequentWrong', '자주 틀림'], ['mastered', '익숙함']].map(([value, label]) => (
                      <button key={value} type="button" onClick={() => changeStudyFilter(value)} className={`rounded-full px-4 py-2 text-xs font-bold transition ${(progress.studyFilter ?? 'all') === value ? 'bg-slate-950 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{label} <span className="opacity-70">{statusCounts[value] ?? 0}</span></button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">정답/오답 기록에 따라 처음 봄, 학습 중, 오답 복습, 자주 틀림, 익숙함으로 자동 분류됩니다.</p>
                </div>

                {loading && <div className="rounded-3xl bg-white p-8 text-center shadow-sm">단어 데이터를 불러오는 중입니다...</div>}
                {error && <div className="rounded-3xl bg-rose-50 p-8 text-center font-semibold text-rose-700">{error}</div>}
                {!loading && !error && filteredWords.length === 0 && (
                  <div className="rounded-3xl bg-white p-8 text-center text-sm font-semibold text-slate-500">{statusLabel(progress.studyFilter ?? 'all')} 조건에 맞는 단어가 없습니다. 다른 필터를 선택해 주세요.</div>
                )}

                {!loading && !error && filteredWords.length > 0 && !isExamMode && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-white/85 px-4 py-3 text-sm font-black text-slate-700 shadow-sm sm:px-5">
                      <span>현재 단어</span>
                      <span className="rounded-full bg-indigo-600 px-3 py-1 text-white">학습 {learningPosition} / {currentDeck.length || filteredWords.length}</span>
                    </div>
                    <WordCard key={currentWord?.id ?? 'empty-word'} word={currentWord} flipped={flipped} onFlip={() => setFlipped((value) => !value)} />
                  </div>
                )}

                {!loading && !error && filteredWords.length > 0 && isExamMode && (
                  <section className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-xl shadow-violet-100/60 sm:p-8">
                    <div className="mb-6 flex items-center justify-between">
                      <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-600">시험모드 · {examLimit}문제</span>
                      <span className="text-sm text-slate-400">{Math.min(examTotal + 1, examLimit)} / {examLimit}</span>
                    </div>
                    {examCompleted ? (
                      <div className="rounded-3xl bg-violet-50 p-6 text-center">
                        <p className="text-2xl font-black text-violet-700">시험 완료</p>
                        <p className="mt-3 text-slate-600">{examLimit}문제 중 {progress.examCorrect}개 정답, {progress.examWrong}개 오답입니다.</p>
                        <p className="mt-1 text-sm text-slate-500">랭킹 화면에서 점수를 저장할 수 있습니다.</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium uppercase tracking-[0.35em] text-slate-400">QUESTION</p>
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                          <h2 className="break-words text-5xl font-black tracking-tight text-slate-950 sm:text-6xl">{currentWord?.word ?? '-'}</h2>
                          {currentWord && <SpeakButton text={currentWord.word} lang={currentWord.lang === 'ja' ? 'ja-JP' : 'en-US'} label="단어 듣기" />}
                        </div>
                        {currentWord?.reading && <p className="mt-4 text-xl text-slate-500">{currentWord.reading}</p>}
                        <form onSubmit={submitExam} className="mt-8 space-y-4">
                          <input value={examAnswer} onChange={(event) => setExamAnswer(event.target.value)} disabled={!!examFeedback || aiChecking} placeholder="뜻을 입력하세요. 예: 사과" className="w-full rounded-2xl border border-slate-200 px-5 py-4 text-lg outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50" />
                          <button type="submit" disabled={!currentWord || !examAnswer.trim() || !!examFeedback || aiChecking} className="w-full rounded-2xl bg-violet-600 px-6 py-4 text-lg font-black text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">{aiChecking ? 'AI가 확인 중…' : '정답 확인'}</button>
                        </form>
                        {examFeedback && (
                          <div className={`mt-6 rounded-2xl p-5 ${examFeedback.correct ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                            <p className="text-lg font-black">{examFeedback.correct ? '정답입니다!' : '오답입니다.'}</p>
                            <p className="mt-2 text-sm">정답: {examFeedback.answer}</p>
                            {examFeedback.reason && <p className="mt-2 rounded-xl bg-white/60 p-3 text-sm font-semibold leading-6">이유: {examFeedback.reason}</p>}
                            {examFeedback.aiGrade && (
                              <p className="mt-2 text-xs opacity-80">
                                {examFeedback.aiGrade.verdict === 'correct'
                                  ? `AI 판정: 정답 인정 · 신뢰도 ${Math.round(Number(examFeedback.aiGrade.confidence || 0) * 100)}%`
                                  : examFeedback.aiGrade.verdict === 'partial'
                                    ? 'AI 판정: 의미는 가깝지만 정답으로 인정하지 않음'
                                    : examFeedback.aiGrade.verdict === 'wrong'
                                      ? 'AI 판정: 정답으로 인정하지 않음'
                                      : 'AI 판정: 확인하지 못함'}
                              </p>
                            )}
                            {examFeedback.source === 'ai-local-cache' && <p className="mt-2 text-xs opacity-80">이전에 AI가 정답 처리한 답안이라 바로 인정했습니다.</p>}
                            <button type="button" onClick={moveNext} className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">{examTotal >= examLimit ? '시험 결과 보기' : '다음 랜덤 단어'}</button>
                          </div>
                        )}
                      </>
                    )}
                  </section>
                )}
              </section>

              {!isExamMode && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <button type="button" onClick={() => answer('wrong')} disabled={!currentWord} className="rounded-3xl bg-rose-500 px-6 py-4 text-lg font-black text-white shadow-lg shadow-rose-200 transition hover:-translate-y-0.5 hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40">오답</button>
                  <button type="button" onClick={() => answer('correct')} disabled={!currentWord} className="rounded-3xl bg-emerald-500 px-6 py-4 text-lg font-black text-white shadow-lg shadow-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">정답</button>
                  <button type="button" onClick={moveNext} disabled={!currentWord} className="rounded-3xl bg-slate-900 px-6 py-4 text-lg font-black text-white shadow-lg shadow-slate-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40">건너뛰기</button>
                </div>
              )}
            </>
          )}

          {activeView === 'leaderboard' && (
            <section className="space-y-5 rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur sm:p-6">
              <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                <h2 className="text-lg font-black">시험 점수 저장</h2>
                <p className="mt-2 text-sm text-slate-500">{examLimit}문제 시험 결과 {progress.examCorrect}정답 / {progress.examWrong}오답을 현재 필터 랭킹에 저장합니다.</p>
                <button type="button" onClick={submitScore} className="mt-4 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-700">랭킹에 점수 저장</button>
                {syncStatus && <p className="mt-3 text-sm font-semibold text-slate-600">{syncStatus}</p>}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-black">{examLimit}문제 랭킹</h2>
                  <button type="button" onClick={() => refreshLeaderboard(activeLanguage)} className="text-sm font-bold text-indigo-600">새로고침</button>
                </div>
                <div className="mt-4 space-y-2">
                  {leaderboardLoading && <p className="text-sm text-slate-500">랭킹을 불러오는 중입니다...</p>}
                  {!leaderboardLoading && leaderboard.length === 0 && <p className="text-sm text-slate-500">아직 저장된 점수가 없습니다.</p>}
                  {leaderboard.map((row, index) => (
                    <div key={`${row.display_name}-${row.last_submitted_at}`} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                      <div>
                        <p className="font-black text-slate-900">{index + 1}. {row.display_name}</p>
                        <p className="text-xs text-slate-500">{row.question_count ?? examLimit}문제 · 도전 {row.attempts}회</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-indigo-600">{row.best_correct}개</p>
                        <p className="text-xs text-slate-500">정답률 {row.best_accuracy}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </section>
          )}

          {activeView === 'profile' && (
            <section className="space-y-5 rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur sm:p-6">
              <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-black">내 정보</h2>
                  <button type="button" onClick={logout} className="text-sm font-bold text-slate-500 hover:text-slate-900">로그아웃</button>
                </div>
                <div className="mt-4 rounded-2xl bg-indigo-50 p-4 text-sm text-indigo-900">
                  <p className="font-black">{auth.user.displayName}님 로그인 중</p>
                  <p className="mt-1">학습 언어: {auth.user.preferredLanguage === 'ja' ? '일본어' : auth.user.preferredLanguage === 'en' ? '영어' : '전체'}</p>
                  <p className="mt-2 text-xs text-indigo-700">실명/생년월일은 관리자 확인용이며 랭킹에는 표시되지 않습니다.</p>
                </div>
              </section>

              <ProgressBar current={answeredCount} total={filteredWords.length} correct={progress.correct} wrong={progress.wrong} examCorrect={progress.examCorrect} examWrong={progress.examWrong} />

              <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                <h2 className="text-lg font-black">단어 상태 요약</h2>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  {['new', 'learning', 'review', 'frequentWrong', 'mastered'].map((status) => (
                    <button key={status} type="button" onClick={() => { setActiveView('learn'); changeStudyFilter(status); }} className="rounded-2xl bg-slate-50 px-4 py-3 text-left font-bold text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700">
                      <span className="block text-xs text-slate-400">{statusLabel(status)}</span>
                      <span className="text-lg font-black">{statusCounts[status]}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                <h2 className="text-lg font-black">비밀번호 변경</h2>
                <p className="mt-2 text-sm text-slate-500">{auth.user.displayName || auth.user.username}님 계정의 비밀번호만 변경할 수 있습니다.</p>
                <form onSubmit={changeOwnPassword} className="mt-4 space-y-3">
                  <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((form) => ({ ...form, currentPassword: e.target.value }))} placeholder="현재 비밀번호" autoComplete="current-password" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
                  <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((form) => ({ ...form, newPassword: e.target.value }))} placeholder="새 비밀번호" autoComplete="new-password" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
                  <input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((form) => ({ ...form, confirmPassword: e.target.value }))} placeholder="새 비밀번호 확인" autoComplete="new-password" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
                  <button type="submit" className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white">비밀번호 변경</button>
                  {passwordStatus && <p className="text-sm font-semibold text-slate-600">{passwordStatus}</p>}
                </form>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                <h2 className="text-lg font-black">학습 상태</h2>
                <dl className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="flex justify-between"><dt>모드</dt><dd>{isExamMode ? '시험모드' : '학습모드'}</dd></div>
                  <div className="flex justify-between"><dt>현재 위치</dt><dd>{isExamMode ? `${Math.min(examTotal, examLimit)} / ${examLimit}` : `${filteredWords.length ? currentIndex + 1 : 0} / ${filteredWords.length}`}</dd></div>
                  <div className="flex justify-between"><dt>최근 저장</dt><dd>{progress.updatedAt ? new Date(progress.updatedAt).toLocaleString('ko-KR') : '아직 없음'}</dd></div>
                </dl>
                <button type="button" onClick={() => setProgress((prev) => ({ ...prev, deck: makeDeck(filteredWords), deckCursor: 0, updatedAt: new Date().toISOString() }))} className="mt-5 w-full rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100">랜덤 순서 다시 섞기</button>
                <button type="button" onClick={resetProgress} className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50">진도 초기화</button>
              </section>
            </section>
          )}

          {activeView === 'request' && (
            <section className="rounded-[2rem] border border-amber-100 bg-white/80 p-5 shadow-sm backdrop-blur sm:p-6">
              <h2 className="text-xl font-black">관리자에게 건의/요청</h2>
              <p className="mt-2 text-sm text-slate-500">오류, 단어 추가, 개선 아이디어를 관리자에게 쪽지처럼 보낼 수 있습니다.</p>
              <form onSubmit={submitRequest} className="mt-5 space-y-3">
                <select value={requestForm.type} onChange={(e) => setRequestForm((form) => ({ ...form, type: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400">
                  <option value="suggestion">건의</option>
                  <option value="bug">오류</option>
                  <option value="word">단어 추가 요청</option>
                  <option value="other">기타</option>
                </select>
                <textarea value={requestForm.message} onChange={(e) => setRequestForm((form) => ({ ...form, message: e.target.value.slice(0, 1000) }))} rows="8" placeholder="관리자에게 보낼 내용을 적어주세요." className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400" />
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>HTML은 텍스트로만 표시됩니다.</span>
                  <span>{requestForm.message.length}/1000</span>
                </div>
                <button type="submit" className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-black text-white transition hover:bg-amber-600">관리자에게 보내기</button>
                {requestStatus && <p className="text-sm font-semibold text-slate-600">{requestStatus}</p>}
              </form>
            </section>
          )}
        </section>

        <aside className="hidden lg:block">
          <div className="sticky top-8 space-y-3 rounded-[2rem] border border-white/70 bg-white/85 p-4 shadow-xl shadow-indigo-100/50 backdrop-blur">
            <div className="px-2 py-2">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-indigo-500">Menu</p>
              <p className="mt-2 text-sm font-semibold text-slate-500">{auth.user.displayName || auth.user.username}님</p>
            </div>
            {menuItems.map((item) => (
              <button key={item.id} type="button" onClick={() => navigate(item.id)} className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-black transition ${activeView === item.id ? 'bg-slate-950 text-white shadow-lg' : 'bg-white text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'}`}>
                <span><span className="mr-2">{item.icon}</span>{item.label}</span>
                <span>›</span>
              </button>
            ))}
            <button type="button" onClick={logout} className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-black text-rose-600 transition hover:bg-rose-50">
              <span><span className="mr-2">🚪</span>로그아웃</span>
              <span>›</span>
            </button>
          </div>
        </aside>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" />
          <nav className="absolute right-0 top-0 flex h-full w-[82vw] max-w-sm flex-col gap-3 rounded-l-[2rem] bg-white p-5 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-indigo-500">Menu</p>
                <p className="mt-2 text-sm font-semibold text-slate-500">{auth.user.displayName || auth.user.username}님</p>
              </div>
              <button type="button" onClick={() => setMenuOpen(false)} className="rounded-2xl bg-slate-100 px-4 py-3 text-lg font-black">×</button>
            </div>
            {menuItems.map((item) => (
              <button key={item.id} type="button" onClick={() => navigate(item.id)} className={`flex items-center justify-between rounded-2xl px-4 py-4 text-left text-base font-black transition ${activeView === item.id ? 'bg-slate-950 text-white shadow-lg' : 'bg-slate-50 text-slate-700'}`}>
                <span><span className="mr-3">{item.icon}</span>{item.label}</span>
                <span>›</span>
              </button>
            ))}
            <button type="button" onClick={logout} className="mt-auto flex items-center justify-between rounded-2xl bg-rose-50 px-4 py-4 text-left text-base font-black text-rose-600">
              <span><span className="mr-3">🚪</span>로그아웃</span>
              <span>›</span>
            </button>
          </nav>
        </div>
      )}
    </main>
  );
}
