# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

손민기(smk692)의 기술 블로그. Gatsby v4 기반 정적 사이트로 GitHub Pages에 배포됨.
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
- `static/`: favicon, og-image 등 public 파일

### 빌드 파이프라인
1. Markdown → HTML (`gatsby-transformer-remark`)
2. 코드 하이라이팅 (`prismjs`)
3. 이미지 최적화 (`gatsby-plugin-image`)
4. SEO 자동 생성 (sitemap.xml, robots.txt)

### CI/CD
- `develop` 브랜치 push → 자동 빌드 및 배포
- `main` 브랜치 PR → Lighthouse 성능 테스트 자동 실행
- `workflow_dispatch` → GitHub Actions에서 수동 포스트 생성
- Node.js v20 LTS 사용

### AI 포스트 생성 (generate_blog_post.py v2.0)
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
- GPT-4o 기반 고품질 콘텐츠
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
Google Analytics: `UA-265647540-1`
