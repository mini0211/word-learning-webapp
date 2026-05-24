# 배포 후 점검 절차

GitHub Pages 배포 후 아래 순서로 확인한다.

1. `https://mini0211.github.io/word-learning-webapp/` 접속
2. 브라우저 개발자 도구 Console 탭에서 JavaScript 오류가 없는지 확인
3. 로그인 화면과 회원가입 전환 버튼 표시 확인
4. 테스트 계정 또는 mock 환경으로 학습/시험/랭킹 기본 이동 확인
5. API health check 확인

```bash
curl -fsS https://lumi-storage.taild1716c.ts.net/health
```

성공 기준:

- GitHub Pages 화면이 정상 렌더링된다.
- Console에 앱 오류가 없다.
- `/health`가 성공 응답을 반환한다.
- `npm test`, `npm run build`, `npm run test:e2e`가 CI에서 통과한다.
