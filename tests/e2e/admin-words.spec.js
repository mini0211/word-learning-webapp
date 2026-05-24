import { expect, test } from '@playwright/test';

const API_BASE = 'https://lumi-storage.taild1716c.ts.net';

async function mockAdminApi(page) {
  const state = {
    words: [
      {
        id: 'en-beginner-apple',
        lang: 'en',
        level: 'beginner',
        word: 'apple',
        meaning: '사과',
        acceptedAnswers: ['사과'],
        active: true,
      },
    ],
  };

  await page.route(`${API_BASE}/auth/login`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'admin-token',
        user: {
          id: 1,
          username: 'admin',
          displayName: '관리자',
          preferredLanguage: 'en',
          enLevel: 'beginner',
          jaLevel: 'beginner',
          role: 'admin',
        },
      }),
    });
  });

  await page.route(`${API_BASE}/me`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 1,
          username: 'admin',
          displayName: '관리자',
          preferredLanguage: 'en',
          enLevel: 'beginner',
          jaLevel: 'beginner',
          role: 'admin',
        },
      }),
    });
  });

  await page.route(`${API_BASE}/admin/users`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [] }) });
  });

  await page.route(`${API_BASE}/admin/words**`, async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ words: state.words }) });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      const word = { ...body, id: 'en-beginner-orange', active: true };
      state.words.unshift(word);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ word }) });
      return;
    }
    await route.fallback();
  });

  await page.route(`${API_BASE}/admin/words/*`, async (route) => {
    const request = route.request();
    const id = request.url().split('/').pop();
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON();
      state.words = state.words.map((word) => (word.id === id ? { ...word, ...body } : word));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ word: state.words.find((word) => word.id === id) }) });
      return;
    }
    await route.fallback();
  });
}

test('admin can add and deactivate words from the admin dashboard', async ({ page }) => {
  await mockAdminApi(page);

  await page.goto('/');
  await page.getByPlaceholder('아이디').fill('admin');
  await page.getByPlaceholder('비밀번호').fill('admin-password');
  await page.getByRole('button', { name: '로그인하고 시작하기' }).click();

  await expect(page.getByRole('heading', { name: '단어 학습 관리자' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '단어 관리' })).toBeVisible();
  await expect(page.getByText('apple')).toBeVisible();

  await page.getByPlaceholder('단어').fill('orange');
  await page.getByPlaceholder('뜻').fill('오렌지');
  await page.getByPlaceholder('인정 답안').fill('오렌지, 귤색');
  await page.getByRole('button', { name: '단어 추가' }).click();

  await expect(page.getByText('orange')).toBeVisible();
  await expect(page.getByText('단어를 추가했습니다.')).toBeVisible();

  await page.getByRole('button', { name: '비활성화' }).first().click();
  await expect(page.getByText('단어를 비활성화했습니다.')).toBeVisible();
});

test('regular users cannot see admin menu', async ({ page }) => {
  await page.route(`${API_BASE}/auth/login`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'user-token',
        user: { id: 2, username: 'user', displayName: '일반 사용자', preferredLanguage: 'en', enLevel: 'beginner', jaLevel: 'beginner', role: 'user' },
      }),
    });
  });
  await page.route(`${API_BASE}/me`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 2, username: 'user', displayName: '일반 사용자', preferredLanguage: 'en', enLevel: 'beginner', jaLevel: 'beginner', role: 'user' } }) });
  });
  await page.route(`${API_BASE}/progress**`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().method() === 'GET' ? { progress: null } : { ok: true, progress: {} }) });
  });
  await page.route(`${API_BASE}/leaderboard**`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ leaderboard: [] }) });
  });

  await page.goto('/');
  await page.getByPlaceholder('아이디').fill('user');
  await page.getByPlaceholder('비밀번호').fill('user-password');
  await page.getByRole('button', { name: '로그인하고 시작하기' }).click();

  await expect(page.getByRole('heading', { name: '학습' })).toBeVisible();
  await expect(page.getByRole('button', { name: '관리자 메뉴' })).toHaveCount(0);
});
