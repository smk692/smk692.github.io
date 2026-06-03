---
layout: post
emoji: 🗺️
title: "Understand Anything: 코드베이스를 지식 그래프로 시각화하는 도구"
date: "2026-05-24 21:10:00"
author: 손(Son/손민기)
tags: "UnderstandAnything ClaudeCode 코드분석 온보딩 레거시코드 아키텍처 시각화"
categories: Tech
series: "Understand-Anything"
readingTime: 7
---

## 레거시 코드 파악, 왜 어려운가

대규모 코드베이스에 새로 투입되면 흔히 겪는 상황이 있다.

- README는 몇 년 전 업데이트가 마지막
- 아키텍처 다이어그램이 현재 코드와 맞지 않음
- 작성자가 퇴사해서 물어볼 사람이 없음

기존 방식으로는 한계가 있다:
- `grep -r "keyword"` → 수백 개 파일 매칭, 어디서 시작해야 할지 모름
- IDE의 Go to Definition → 10번 점프하면 원래 뭘 찾던 건지 잊음
- 선배에게 질문 → "그건 레거시라 나도 잘 몰라"

**Understand Anything**은 이 문제를 해결하는 Claude Code 플러그인이다. 코드베이스 전체를 분석해서 **인터랙티브한 지식 그래프**로 변환한다.

## 실제 대시보드

![Understand Anything 대시보드](./dashboard.png)

코드베이스가 **클릭 가능한 그래프**로 변환된다:

- 각 노드 = 파일, 함수, 클래스
- 색상 = 아키텍처 레이어 (API, Service, Data, UI, Utility)
- 연결선 = 의존성 관계
- 노드 클릭 시 = 코드 + AI 생성 설명 표시

## 기존 방식과 비교

| 기존 방식 | Understand Anything |
|----------|---------------------|
| `grep "payment"` → 200개 파일 | 검색 → 관련 모듈이 그래프에서 하이라이트 |
| Go to Definition 연타 → 미아 | 의존성 트리가 한눈에 보임 |
| 주석 없는 함수 → 추측 | 노드 클릭 → AI가 생성한 설명 |
| 선배에게 질문 → 한계 | 가이드 투어로 혼자 학습 가능 |

## 주요 활용 시나리오

### 1. 특정 플로우 파악

```bash
/understand-chat 결제 플로우는 어떻게 동작해?
```

관련 파일을 찾아서 **호출 순서대로** 설명한다:
1. `PaymentController` → 요청 수신
2. `PaymentService` → 비즈니스 로직
3. `PGAdapter` → 외부 연동
4. `PaymentRepository` → DB 저장

grep으로는 알 수 없는 **흐름**을 파악할 수 있다.

### 2. 변경 영향 분석

```bash
/understand-diff
```

PR 전에 변경한 파일이 어디에 영향을 미치는지 그래프로 확인한다. 영향받는 모듈이 빨간색으로 표시되면 해당 영역 테스트가 필요하다는 신호다.

### 3. 온보딩 자료 자동화

```bash
/understand
git add .understand-anything/
git commit -m "docs: add knowledge graph"
```

생성된 그래프를 Git에 커밋하면, 이후 합류하는 사람은 파이프라인 재실행 없이 바로 대시보드를 열 수 있다.

## 설치 방법

### Claude Code

```bash
/plugin marketplace add Lum1104/Understand-Anything
/plugin install understand-anything
```

### 기타 플랫폼

Cursor, VS Code + Copilot, Codex CLI, Gemini CLI 등도 지원한다.

```bash
# macOS/Linux
curl -fsSL https://raw.githubusercontent.com/Lum1104/Understand-Anything/main/install.sh | bash
```

### 기본 사용

```bash
# 1. 코드베이스 분석 (최초 1회)
/understand

# 2. 대시보드 열기
/understand-dashboard

# 3. 질문하기
/understand-chat 인증은 어떻게 처리돼?
```

### 한국어 지원

```bash
/understand --language ko
```

노드 설명, UI, 가이드 투어가 한국어로 제공된다.

## 참고 사항

**분석 시간**:
- 100 파일 이하: 1-2분
- 1000 파일 이하: 5-10분
- 그 이상: 15-30분

증분 업데이트는 변경 파일만 재분석하므로 1분 이내다.

**비용**: LLM API 호출이 발생한다. Claude Code 사용 시 Anthropic API 비용이 청구된다.

**민감 정보**: 그래프에 함수명, 클래스명이 포함된다. 공개 저장소에 커밋할 때 주의가 필요하다.

## 추천 대상

- 레거시 프로젝트에 새로 투입된 개발자
- 온보딩 자료 작성이 필요한 팀
- 아키텍처 문서가 코드와 동기화되지 않은 프로젝트
- PR 리뷰 시 변경 영향 범위를 명확히 하고 싶은 경우

---

**참고 링크:**
- [GitHub 저장소](https://github.com/Lum1104/Understand-Anything)
- [라이브 데모](https://understand-anything.com/demo/)
- [Discord 커뮤니티](https://discord.gg/pydat66RY)
