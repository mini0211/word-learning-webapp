export function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s.,!?，、。·・~`'"“”‘’()\[\]{}:;/-]+/g, '')
    .trim();
}

export function answerCandidates(word) {
  const raw = [word?.meaning, ...(word?.acceptedAnswers ?? [])].filter(Boolean);
  const seen = new Set();
  return raw
    .flatMap((item) => String(item).split(/[,，、/]| 또는 | 혹은 |\sor\s/i))
    .map((item) => item.trim())
    .filter((item) => {
      const key = normalizeAnswer(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function koreanLooseForms(value) {
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

export function isAnswerMatch(input, candidate) {
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

export function judgeAnswer(input, word) {
  if (!input || !word) return false;
  return answerCandidates(word).some((candidate) => isAnswerMatch(input, candidate));
}
