---
layout: post
emoji: 🧩
title: "Claude Skills 핵심 정리: AI를 도메인 전문가로 만드는 방법"
date: "2026-05-25 10:00:00"
author: 손(Son/손민기)
tags: "ClaudeSkills ClaudeCode AI에이전트 자동화 VoltAgent AwesomeClaudeSkills"
categories: Tech
readingTime: 8
---

Claude가 단순한 챗봇이 아니라 **도메인 전문가**처럼 동작하게 만들 수 있다. Claude Skills를 사용하면 된다.

## Claude Skills란?

Claude Skills는 Anthropic의 Claude AI에 특정 능력을 부여하는 **확장 모듈**이다. 각 스킬은 폴더 단위로 구성되며, 내부에는 다음이 포함된다:

- `SKILL.md` - 스킬 설명 및 트리거 조건
- 관련 코드 및 스크립트
- 참조 문서 및 예시

핵심은 **지연 로드(Lazy Loading)** 다. 수백 개의 스킬을 등록해도 필요한 스킬만 불러오기 때문에 토큰 낭비가 없다.

```
~/.claude/skills/
├── code-reviewer/
│   └── SKILL.md
├── tech-blog-writer/
│   └── SKILL.md
└── security-auditor/
    └── SKILL.md
```

## 왜 Skills인가?

기존 프롬프트 엔지니어링의 한계:

| 기존 방식 | Claude Skills |
|----------|---------------|
| 매번 긴 시스템 프롬프트 작성 | 스킬 이름만 호출 |
| 컨텍스트 윈도우 낭비 | 필요한 스킬만 로드 |
| 재사용 어려움 | 폴더 복사로 공유 |
| 일관성 유지 힘듦 | 버전 관리 가능 |

실제 사용 예시:

```bash
# 코드 리뷰 요청
/code-reviewer "src/auth/login.ts 보안 검토해줘"

# 블로그 작성
/tech-blog-writer "Docker 네트워킹 기초"

# 커밋 메시지 생성
/commit
```

## Awesome Claude Skills 저장소

[VoltAgent/awesome-claude-skills](https://github.com/VoltAgent/awesome-claude-skills)는 Anthropic 공식 스킬과 커뮤니티 제작 스킬을 한곳에 모은 큐레이션 프로젝트다.

### Anthropic 공식 스킬

**문서 생성**
- Word(docx), PowerPoint(pptx), Excel(xlsx) 자동 생성
- PDF 편집 및 변환
- 템플릿 기반 문서 자동화

**창작 및 디자인**
- 알고리즘 아트 생성
- 캔버스 디자인
- GIF 애니메이션 제작
- 테마 팩토리 (색상 팔레트, 디자인 시스템)

**개발 및 테스트**
- HTML 아티팩트 빌드
- MCP 서버 구축
- Playwright 기반 웹 테스트 자동화

### 커뮤니티 스킬

| 스킬 | 설명 |
|------|------|
| Notion 통합 | 데이터베이스 CRUD, 페이지 자동 생성 |
| 콘텐츠 연구 | 주제 리서치 후 초안 작성 |
| 회의 분석 | 회의록에서 액션 아이템 추출 |
| iOS 시뮬레이터 | 앱 UI 테스트 자동화 |
| 웹 보안 테스트 | ffuf 기반 퍼징, 취약점 스캔 |

## 스킬 설치 방법

### 1. 저장소 클론

```bash
git clone https://github.com/VoltAgent/awesome-claude-skills.git
cd awesome-claude-skills
```

### 2. 원하는 스킬 복사

```bash
# 전체 복사
cp -r skills/* ~/.claude/skills/

# 또는 개별 스킬만
cp -r skills/code-reviewer ~/.claude/skills/
```

### 3. Claude Code에서 확인

```bash
claude
> /skills  # 설치된 스킬 목록 확인
```

## 커스텀 스킬 만들기

자신만의 스킬을 만들 수 있다. 기본 구조:

```
my-custom-skill/
├── SKILL.md          # 필수: 스킬 정의
├── references/       # 선택: 참조 문서
│   └── guide.md
└── examples/         # 선택: 예시 파일
    └── sample.md
```

### SKILL.md 작성 예시

```yaml
---
name: api-designer
description: REST API 설계를 도와주는 스킬
triggers:
  - API 설계
  - 엔드포인트 설계
  - REST 설계
argument-hint: "<리소스명> [HTTP 메서드]"
---

# API Designer Skill

## 역할
RESTful API 설계 전문가로서 다음을 수행:
- 리소스 URL 설계
- HTTP 메서드 매핑
- 요청/응답 스키마 정의
- 에러 코드 표준화

## 설계 원칙
1. 리소스는 명사, 복수형 사용
2. 계층 구조는 URL 경로로 표현
3. 필터링은 쿼리 파라미터로
...
```

## 스킬 조합

여러 스킬을 조합하면 복잡한 워크플로우를 자동화할 수 있다.

**예시: 기술 블로그 자동화 파이프라인**

```
1. /content-researcher "Kubernetes HPA 동작 원리"
   → 주제 리서치 및 참고자료 수집

2. /tech-blog-writer "위 리서치 기반으로 블로그 작성"
   → 초안 생성

3. /code-reviewer "코드 예시 검증"
   → 예시 코드 동작 확인

4. /seo-optimizer "SEO 최적화"
   → 메타데이터, 키워드 최적화
```

## 주의사항

**토큰 관리**
- 스킬 내 참조 문서가 너무 크면 컨텍스트를 압박한다
- 핵심 내용만 포함하고, 상세 내용은 외부 링크로

**트리거 충돌**
- 여러 스킬이 비슷한 트리거를 가지면 예상치 못한 스킬이 활성화될 수 있다
- 트리거는 구체적으로 설정

**버전 관리**
- 스킬 폴더를 Git으로 관리하면 변경 이력 추적 가능
- 팀 내 스킬 공유 시 저장소로 관리 권장

## 마무리

Claude Skills는 단순한 프롬프트 재사용을 넘어, **AI를 특정 업무에 맞춤 설정**하는 도구다.

시작하기 좋은 경로:
1. [Awesome Claude Skills](https://github.com/VoltAgent/awesome-claude-skills)에서 유용한 스킬 탐색
2. 자주 사용하는 워크플로우를 스킬로 정리
3. 팀 내 스킬 라이브러리 구축

공식 문서: [Claude Code Skills Documentation](https://docs.anthropic.com/en/docs/claude-code/skills)

```toc
```
