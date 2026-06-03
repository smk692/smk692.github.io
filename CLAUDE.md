# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

손민기(smk692)의 기술 블로그. Gatsby v5 기반 정적 사이트로 GitHub Pages에 배포됨.
주요 콘텐츠: 백엔드 개발, 인프라, CS 면접 질문.

## 주요 명령어

```bash
# 개발 서버 실행 (http://localhost:8000)
npm start

# 프로덕션 빌드
npm run build

# GitHub Pages 배포
npm run deploy

# 코드 포맷팅
npm run format

# 캐시 정리
npm run clean

# 의존성 설치 (반드시 --legacy-peer-deps 사용)
npm install --legacy-peer-deps
```

## 블로그 포스트 작성

### 파일 구조
```
content/
├── [category]/
│   └── [post-name]/
│       ├── index.md (또는 content.md, [name].md)
│       └── [images]
```

### Frontmatter 형식
```yaml
---
layout: post
emoji: 🧢
title: "포스트 제목"
date: '2024-01-01 12:00:00'
author: 손(Son/손민기)
tags: tag1 tag2 tag3
categories: 카테고리명
readingTime: 5              # 읽기 시간 (분, 자동 계산됨)
series: "시리즈명"           # 시리즈 포스트 연결 (선택)
updatedDate: '2024-01-15'   # 마지막 수정일 (선택)
thumbnail: ./thumbnail.png   # 대표 이미지 (선택)
---
```

### 목차 자동 생성
포스트 하단에 추가:
````
```toc
```
````

## 아키텍처

### 핵심 설정 파일
- `gatsby-meta-config.js`: 블로그 메타데이터, 저자 정보, About 페이지 콘텐츠
- `gatsby-config.js`: Gatsby 플러그인 설정
- `gatsby-node.js`: 동적 페이지 생성 로직

### 주요 디렉토리
- `src/components/`: React 컴포넌트 (bio, post-card, theme-switch 등)
- `src/templates/`: 블로그 포스트 및 카테고리 페이지 템플릿
- `src/styles/`: SCSS 스타일 (_colors.scss, _variables.scss)
- `content/`: 마크다운 블로그 포스트
- `assets/`: 저자 썸네일 등 정적 이미지
- `static/`: favicon, og-image, HTML 파일 등 public 파일

### 빌드 파이프라인
1. Markdown → HTML (`gatsby-transformer-remark`)
2. 코드 하이라이팅 (`prismjs`)
3. 이미지 최적화 (`gatsby-plugin-image`)
4. SEO 자동 생성 (sitemap.xml, robots.txt, rss.xml)

### CI/CD
- `develop` 브랜치 push → 자동 빌드 및 배포
- `main` 브랜치 PR → Lighthouse 성능 테스트 자동 실행
- `workflow_dispatch` → GitHub Actions에서 수동 포스트 생성
- Node.js v18+ 사용 (v20 LTS 권장)
- 의존성 설치 시 `--legacy-peer-deps` 플래그 필수

## 블로그 기능

### UI/UX 기능
- **스크롤 진행률 바**: 상단에 읽기 진행 상황 표시
- **목차(TOC) 하이라이트**: 스크롤 시 현재 섹션 강조
- **이미지 라이트박스**: 클릭 시 이미지 확대
- **다크/라이트 모드**: 테마 전환 지원

### 콘텐츠 기능
- **코드 복사 버튼**: 코드 블록에 복사 버튼 자동 추가
- **관련 포스트 추천**: 포스트 하단에 관련 글 표시
- **SNS 공유 버튼**: Twitter, LinkedIn, Facebook 공유
- **읽기 시간 자동 계산**: 한국어 기준 분당 500자

### 탐색 기능
- **아카이브 페이지** (`/archive`): 연도별 포스트 목록
- **태그 클라우드**: 인기 태그 시각화
- **키보드 단축키**: j/k(이전/다음), /(검색), h(홈)

### SEO & 피드
- **RSS 피드** (`/rss.xml`): 구독 지원
- **사이트맵** (`/sitemap.xml`): 검색엔진 최적화
- **구조화된 메타데이터**: Open Graph, Twitter Card

### 정적 파일 서빙
`static/` 폴더에 파일을 넣으면 빌드 시 자동으로 public에 복사됨:
```
static/
├── resume/index.html  → /resume/
├── demo.html          → /demo.html
└── files/doc.pdf      → /files/doc.pdf
```

## AI 포스트 생성 (generate_blog_post.py v2.0)

```bash
# 대화형 모드
python generate_blog_post.py

# CLI 모드
python generate_blog_post.py --topic "주제" --categories "Tech" --image

# 옵션
--topic       : 블로그 주제 (필수)
--categories  : 카테고리 (기본: Tech)
--series      : 시리즈 이름 (선택)
--image       : DALL-E 이미지 생성
--interactive : 대화형 모드
```

특징:
- GPT-5.5 기반 고품질 콘텐츠 (OAuth), GPT-4o (API 키)
- AI 클리셰 단어 자동 필터링
- E-E-A-T 프레임워크 준수
- 품질 점수 자동 측정

## 설정 변경

### 블로그 정보 수정
`gatsby-meta-config.js`에서:
- `title`, `description`, `siteUrl`: 기본 정보
- `author.bio`: 홈페이지 소개 애니메이션 텍스트
- `author.social`: GitHub, LinkedIn, 이메일
- `about.timestamps`: 경력/활동 타임라인
- `about.projects`: 프로젝트 목록

### 댓글 시스템
Utterances 사용 (`smk692/blog-comments` 저장소 연동)

### 분석
Google Analytics (gtag): `UA-265647540-1`

## 주요 컴포넌트

| 컴포넌트 | 경로 | 설명 |
|---------|------|------|
| CodeCopyButton | `src/components/code-copy-button/` | 코드 블록 복사 |
| ScrollProgressBar | `src/components/scroll-progress-bar/` | 스크롤 진행률 |
| TocHighlight | `src/components/toc-highlight/` | TOC 하이라이트 |
| ImageLightbox | `src/components/image-lightbox/` | 이미지 확대 |
| ShareButtons | `src/components/share-buttons/` | SNS 공유 |
| RelatedPosts | `src/components/related-posts/` | 관련 포스트 |
| KeyboardShortcuts | `src/components/keyboard-shortcuts/` | 키보드 단축키 |
| TagCloud | `src/components/tag-cloud/` | 태그 클라우드 |
