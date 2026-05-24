# 블로그 고도화 체크리스트

## 완료된 작업

### AI 포스트 생성기 (generate_blog_post.py v2.1)
- [x] GPT-4o → GPT-5.4 모델 업그레이드
- [x] ChatGPT Plus OAuth 인증 (codex-open-client)
- [x] API 키 모드 폴백 지원
- [x] AI 클리셰 단어 자동 필터링
- [x] E-E-A-T 프레임워크 프롬프트
- [x] 품질 점수 자동 측정 (5개 항목)
- [x] CLI 모드 지원 (--topic, --categories, --series, --image)
- [x] 대화형 모드 지원 (--interactive)
- [x] 해시태그 자동 생성 (15개)
- [x] 읽기 시간 자동 계산

### 개발 환경
- [x] Python 가상환경 설정 (.venv, Python 3.11)
- [x] requirements.txt 의존성 정리
- [x] setup.sh 설치 스크립트
- [x] generate_post.sh 래퍼 스크립트
- [x] .gitignore에 Python 관련 항목 추가

### Gatsby 메타데이터 확장 (gatsby-node.js)
- [x] readingTime 자동 계산 (frontmatter → GraphQL)
- [x] series 필드로 시리즈 포스트 연결
- [x] keywords 자동 추출 (태그 기반)
- [x] updatedDate 필드 지원
- [x] GraphQL 스키마 커스터마이징

### CI/CD 파이프라인 (.github/workflows/)
- [x] PR 기반 워크플로우 (develop → main)
- [x] Lighthouse 성능 테스트 자동화 (.lighthouserc.json)
- [x] workflow_dispatch로 수동 포스트 생성
- [x] 빌드 아티팩트 업로드/다운로드
- [x] PR에 Lighthouse 점수 코멘트

### 문서화
- [x] CLAUDE.md 업데이트 (AI 포스트 생성기 사용법)
- [x] tech-blog-writer 스킬 생성 (~/.claude/skills/omc-learned/)

---

## 미완료 작업

### 의존성 업그레이드 (선택사항)
- [ ] Gatsby v4 → v5 마이그레이션
- [ ] React 17 → 18 업그레이드
- [ ] Node.js 20 LTS 호환성 테스트

### 이미지 생성 개선
- [ ] OAuth 모드에서 이미지 생성 지원 (현재 API 키 모드만)

---

## 테스트 결과

| 항목 | 상태 | 비고 |
|------|------|------|
| OAuth 인증 | ✅ 성공 | gpt-5.4, gpt-5.4-mini |
| 포스트 생성 | ✅ 성공 | 품질 점수 100% |
| 해시태그 생성 | ✅ 성공 | 15개 자동 생성 |
| gatsby-node.js | ✅ 완료 | readingTime, series, keywords |
| CI/CD 워크플로우 | ✅ 완료 | PR기반, Lighthouse 통합 |
| 이미지 생성 | ⚠️ 미지원 | OAuth 모드에서 비활성화 |

---

## 사용법 요약

### 블로그 포스트 생성
```bash
# OAuth 모드 (ChatGPT Plus 구독)
./generate_post.sh --topic "주제" --categories "카테고리"

# 대화형 모드
./generate_post.sh --interactive

# API 키 모드 (이미지 생성 가능)
./generate_post.sh --topic "주제" --api-key --image
```

### GitHub Actions 수동 실행
1. GitHub → Actions → "Auto Publish Blog Posts"
2. "Run workflow" 클릭
3. 주제, 카테고리 입력 후 실행
4. 자동 생성된 PR 리뷰 후 머지

### 로컬 개발
```bash
npm start          # 개발 서버 (localhost:8000)
npm run build      # 프로덕션 빌드
npm run deploy     # GitHub Pages 배포
```
