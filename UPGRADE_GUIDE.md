# 블로그 의존성 업그레이드 가이드

> 작성일: 2026-05-24
> Gatsby 4 → 5, React 17 → 18, Node 14 → 20 마이그레이션

## 현재 버전 vs 권장 버전

| 패키지 | 현재 | 권장 | 변경 이유 |
|--------|------|------|-----------|
| Node.js | 14.17.4 | 20 LTS | 보안, 성능, EOL |
| Gatsby | 4.9.3 | 5.x | 50% 빌드 속도 향상 |
| React | 17.0.1 | 18.x | Concurrent Rendering |
| gh-pages | 3.2.3 | 6.x | 최신 기능 |

---

## Phase 1: Node.js 업그레이드

### 1. 로컬 환경
```bash
# nvm 사용 시
nvm install 20
nvm use 20
nvm alias default 20

# 확인
node -v  # v20.x.x
```

### 2. CI/CD 환경
`.github/workflows/auto_publish.yml`에서 이미 업데이트됨:
```yaml
env:
  NODE_VERSION: '20'
```

### 3. Netlify (사용 시)
`netlify.toml` 수정:
```toml
[build.environment]
  NODE_VERSION = "20"
```

---

## Phase 2: Gatsby 5 업그레이드

### 1. 의존성 업데이트
```bash
# Gatsby 코어
npm install gatsby@latest

# Gatsby 플러그인 (호환되는 버전으로)
npm install \
  gatsby-plugin-image@latest \
  gatsby-plugin-sharp@latest \
  gatsby-transformer-sharp@latest \
  gatsby-source-filesystem@latest \
  gatsby-transformer-remark@latest \
  gatsby-remark-images@latest \
  gatsby-remark-prismjs@latest \
  gatsby-plugin-sass@latest \
  gatsby-plugin-manifest@latest \
  gatsby-plugin-offline@latest

# 더 이상 필요 없는 플러그인 제거
npm uninstall gatsby-plugin-react-helmet
npm install gatsby-plugin-sitemap  # advanced-sitemap 대체
```

### 2. Breaking Changes 대응

#### 2.1 React Helmet → Head API
```jsx
// Before (gatsby-plugin-react-helmet)
import { Helmet } from 'react-helmet';

export const MyPage = () => (
  <>
    <Helmet>
      <title>Page Title</title>
    </Helmet>
    <div>Content</div>
  </>
);

// After (Gatsby Head API)
export const Head = () => (
  <>
    <title>Page Title</title>
    <meta name="description" content="..." />
  </>
);

export const MyPage = () => <div>Content</div>;
```

#### 2.2 GraphQL 쿼리 변경
```javascript
// Before
sort: { order: DESC, fields: [frontmatter___date] }

// After
sort: { frontmatter: { date: DESC } }
```

#### 2.3 gatsby-config.js 업데이트
```javascript
// ESM 형식으로 변경 (선택)
// gatsby-config.mjs로 이름 변경 가능
export default {
  siteMetadata: { ... },
  plugins: [ ... ],
};
```

### 3. 테스트
```bash
npm run clean
npm run develop

# 빌드 테스트
npm run build
npm run serve
```

---

## Phase 3: React 18 업그레이드

### 1. 의존성 업데이트
```bash
npm install react@18 react-dom@18
```

### 2. Breaking Changes

#### 2.1 createRoot API (Gatsby가 자동 처리)
Gatsby 5가 자동으로 처리하므로 별도 작업 불필요.

#### 2.2 Strict Mode 경고 확인
개발 모드에서 추가 경고가 나타날 수 있음. 대부분 무시 가능.

---

## Phase 4: 기타 의존성

### 1. 최신 버전으로 업데이트
```bash
# 안전한 업데이트
npm update

# 메이저 버전 업데이트 (주의)
npx npm-check-updates -u
npm install
```

### 2. 더 이상 필요 없는 패키지 정리
```bash
# 사용하지 않는 의존성 확인
npx depcheck

# 정리
npm prune
```

---

## 업그레이드 체크리스트

### 준비
- [ ] 현재 코드 백업 (브랜치 생성)
- [ ] 로컬 환경 Node 20 설치
- [ ] package-lock.json 백업

### Phase 1: Node
- [ ] nvm use 20
- [ ] npm install 성공
- [ ] npm run develop 성공

### Phase 2: Gatsby
- [ ] gatsby@5 설치
- [ ] 플러그인 호환 버전 설치
- [ ] GraphQL 쿼리 문법 수정
- [ ] Head API 마이그레이션
- [ ] npm run build 성공

### Phase 3: React
- [ ] react@18 설치
- [ ] 경고 메시지 확인
- [ ] 기능 테스트

### 배포
- [ ] Lighthouse 점수 확인
- [ ] 프로덕션 배포
- [ ] 롤백 계획 준비

---

## 롤백 방법

문제 발생 시:
```bash
# 이전 버전으로 복구
git checkout main -- package.json package-lock.json
npm install

# 또는 백업 브랜치에서 복구
git checkout backup/pre-upgrade
```

---

## 참고 자료

- [Gatsby 4 → 5 마이그레이션 가이드](https://www.gatsbyjs.com/docs/reference/release-notes/migrating-from-v4-to-v5/)
- [React 18 업그레이드 가이드](https://react.dev/blog/2022/03/08/react-18-upgrade-guide)
- [Node.js 릴리스 일정](https://nodejs.org/en/about/releases/)
