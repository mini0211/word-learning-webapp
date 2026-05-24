import { expect, test } from '@playwright/test';

const API_BASE = 'https://lumi-storage.taild1716c.ts.net';

async function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function openMenuItem(page, name) {
  const button = page.getByRole('button', { name: new RegExp(name) }).last();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    return;
  }
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  await page.getByRole('button', { name: new RegExp(name) }).last().click();
}

async function mockApi(page) {
  await page.route(`${API_BASE}/auth/login`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'e2e-token',
        user: {
          id: 999,
          username: 'e2euser',
          displayName: 'E2E 사용자',
          preferredLanguage: 'en',
          enLevel: 'beginner',
          jaLevel: 'beginner',
          role: 'user',
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
          id: 999,
          username: 'e2euser',
          displayName: 'E2E 사용자',
          preferredLanguage: 'en',
          enLevel: 'beginner',
          jaLevel: 'beginner',
          role: 'user',
        },
      }),
    });
  });
  await page.route(`${API_BASE}/leaderboard**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ leaderboard: [] }),
    });
  });
  await page.route(`${API_BASE}/progress**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(route.request().method() === 'GET' ? { progress: null } : { ok: true, progress: {} }),
    });
  });
  await page.route(`${API_BASE}/grade-answer`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accepted: false, verdict: 'wrong', confidence: 0.99, source: 'e2e-mock' }),
    });
  });
}

test('login screen renders auth entry points without console errors', async ({ page }) => {
  const consoleErrors = await collectConsoleErrors(page);

  await page.goto('/');

  await expect(page.getByRole('heading', { name: '로그인 후 이용하세요' })).toBeVisible();
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '회원가입', exact: true })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('mock user can enter exam flow, submit an answer, and open ranking', async ({ page }) => {
  const consoleErrors = await collectConsoleErrors(page);
  await mockApi(page);

  await page.goto('/');
  await page.getByPlaceholder('아이디').fill('e2euser');
  await page.getByPlaceholder('비밀번호').fill('test-password');
  await page.getByRole('button', { name: '로그인하고 시작하기' }).click();

  await expect(page.getByRole('heading', { name: '학습' })).toBeVisible();
  await page.getByRole('button', { name: '시험모드', exact: true }).click();
  await expect(page.getByText('시험모드 · 25문제')).toBeVisible();

  await page.getByPlaceholder('뜻을 입력하세요. 예: 사과').fill('일부러 틀린 답');
  await page.getByRole('button', { name: '정답 확인' }).click();
  await expect(page.getByText('오답입니다.')).toBeVisible();

  await openMenuItem(page, '랭킹');
  await expect(page.getByRole('heading', { name: '시험 점수 저장' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
