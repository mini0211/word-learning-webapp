import { describe, expect, it } from 'vitest';
import { authMessage, COMBINED_LANGUAGE_HELP_TEXT } from './messages.js';

describe('UI messages', () => {
  it('explains common login and registration errors in actionable Korean', () => {
    expect(authMessage(new Error('invalid_username'))).toContain('영문 소문자, 숫자');
    expect(authMessage(new Error('invalid_password'))).toContain('8자 이상');
    expect(authMessage(new Error('username_taken'))).toContain('이미 사용 중');
    expect(authMessage(new Error('invalid_credentials'))).toContain('아이디 또는 비밀번호');
    expect(authMessage(new Error('network_error'))).toContain('서버에 연결하지 못했습니다');
  });

  it('makes clear that English plus Japanese accounts switch languages by button instead of mixed quizzes', () => {
    expect(COMBINED_LANGUAGE_HELP_TEXT).toContain('혼합 출제');
    expect(COMBINED_LANGUAGE_HELP_TEXT).toContain('영어 버튼과 일본어 버튼');
  });
});
