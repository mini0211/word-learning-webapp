import { describe, expect, it } from 'vitest';
import { answerCandidates, isAnswerMatch, judgeAnswer, normalizeAnswer } from './answerJudge.js';

describe('answerJudge', () => {
  it('normalizes case, width, punctuation, and whitespace', () => {
    expect(normalizeAnswer('  Ａｐｐｌｅ!! ')).toBe('apple');
    expect(normalizeAnswer(' 사 과 ')).toBe('사과');
  });

  it('splits and deduplicates accepted answer candidates', () => {
    const candidates = answerCandidates({ meaning: '사과, 능금', acceptedAnswers: ['apple 또는 사과', '사과'] });

    expect(candidates).toEqual(['사과', '능금', 'apple']);
  });

  it('matches direct and tokenized answers', () => {
    expect(isAnswerMatch('빨간 사과', '사과')).toBe(true);
    expect(isAnswerMatch(' Apple ', 'apple')).toBe(true);
  });

  it('accepts Korean loose verb/noun forms', () => {
    expect(isAnswerMatch('공부', '공부하다')).toBe(true);
    expect(isAnswerMatch('달리', '달리기')).toBe(true);
  });

  it('judges answers against meaning and acceptedAnswers', () => {
    const englishWord = { word: 'apple', meaning: '사과', acceptedAnswers: ['능금'] };
    const japaneseWord = { word: '勉強', meaning: '공부', acceptedAnswers: ['학습'] };

    expect(judgeAnswer('능금', englishWord)).toBe(true);
    expect(judgeAnswer('학습', japaneseWord)).toBe(true);
  });

  it('rejects empty or clearly wrong answers', () => {
    const word = { word: 'apple', meaning: '사과', acceptedAnswers: ['능금'] };

    expect(judgeAnswer('', word)).toBe(false);
    expect(judgeAnswer('자동차', word)).toBe(false);
  });
});
