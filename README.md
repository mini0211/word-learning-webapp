# 단어 학습 웹앱

React + Vite + Tailwind CSS 기반 영어/일본어 단어 학습 웹앱입니다. GitHub Pages에 정적 프론트엔드를 배포하고, 루미스토리지 API를 통해 로그인, 점수, 랭킹, 관리자 기능을 사용합니다.

## 주요 기능

- 로그인 / 회원가입
- 영어, 일본어 단어 학습
- 언어별 레벨테스트와 레벨 기반 학습
- 학습모드 / 시험모드
- 오답 복습과 학습 상태 필터
- 기본 정답 규칙 + AI 의미 확인 기반 채점
- AI 인정 답안 로컬 캐시
- 랭킹 저장 및 조회
- 내 정보 / 비밀번호 변경
- 사용자 건의 요청
- 관리자 대시보드
- PWA 기본 지원
- 브라우저 또는 서버 기반 TTS

## 언어 선택 정책

회원가입에서 `영어 + 일본어`를 선택한 계정은 학습 화면에서 영어/일본어 버튼으로 학습 언어를 전환합니다. 현재 1차 안정화 버전에서는 두 언어를 한 시험에 섞어 출제하지 않고, 언어별 레벨테스트/학습/시험/랭킹을 각각 관리합니다.

## 환경변수

API 주소는 Vite 환경변수로 설정할 수 있습니다.

```powershell
VITE_API_BASE=https://lumi-storage.taild1716c.ts.net
```

환경변수가 없으면 기본값으로 `https://lumi-storage.taild1716c.ts.net`를 사용합니다. 예시는 `.env.example`을 참고하세요.

## 개발 실행

```powershell
npm install
npm run dev
```

## 테스트

```powershell
npm test
```

답안 판정 로직은 `src/utils/answerJudge.js`에 분리되어 있으며 Vitest로 회귀 테스트합니다.

## 빌드 검증

```powershell
npm run build
```

## 배포

Vite base path는 GitHub Pages 저장소 경로에 맞춰 `/word-learning-webapp/`로 설정되어 있습니다.

공개 URL:

```text
https://mini0211.github.io/word-learning-webapp/
```

## 운영 API 확인

```powershell
curl https://lumi-storage.taild1716c.ts.net/health
```

정상 응답 예:

```json
{"ok":true,"db":true}
```

## 데이터

단어 데이터는 `public/words.json`에서 로드합니다. 현재 영어/일본어와 레벨별 데이터를 포함합니다.
