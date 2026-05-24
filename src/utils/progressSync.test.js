import { describe, expect, it } from 'vitest';
import { isServerProgressNewer, mergeProgressByUpdatedAt, serverProgressForLanguage } from './progressSync.js';

describe('progressSync', () => {
  it('keeps only server-safe progress fields for the selected language', () => {
    const progress = serverProgressForLanguage({
      mode: 'exam',
      wordStats: { apple: { seen: 1 } },
      examCorrect: 2,
      examWrong: 1,
      examLimit: 50,
      updatedAt: '2026-05-24T00:00:00.000Z',
      unexpected: 'ignored',
    }, 'en');

    expect(progress).toEqual(expect.objectContaining({
      language: 'en',
      mode: 'exam',
      wordStats: { apple: { seen: 1 } },
      examCorrect: 2,
      examWrong: 1,
      examLimit: 50,
      updatedAt: '2026-05-24T00:00:00.000Z',
    }));
    expect(progress.unexpected).toBeUndefined();
  });

  it('prefers server progress only when server updatedAt is newer', () => {
    const local = { examCorrect: 1, updatedAt: '2026-05-24T01:00:00.000Z' };
    const olderServer = { examCorrect: 9, updatedAt: '2026-05-24T00:59:00.000Z' };
    const newerServer = { examCorrect: 7, wordStats: { word: { seen: 2 } }, updatedAt: '2026-05-24T01:01:00.000Z' };

    expect(isServerProgressNewer(local, olderServer)).toBe(false);
    expect(mergeProgressByUpdatedAt(local, olderServer)).toBe(local);
    expect(mergeProgressByUpdatedAt(local, newerServer)).toEqual(expect.objectContaining({
      examCorrect: 7,
      wordStats: { word: { seen: 2 } },
      updatedAt: '2026-05-24T01:01:00.000Z',
    }));
  });
});
