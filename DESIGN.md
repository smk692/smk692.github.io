---
version: 1.0
name: Handwritten-Diary-design-system
description: 손으로 눌러쓴 개발 일기장. 크림빛 종이 위에 만년필 잉크블루로 적어 내려간 기록. 메뉴와 제목은 삐뚤빼뚤 정겨운 손글씨(Gaegu), 본문은 오래 읽어도 편안한 둥근 고딕(Gowun Dodum). 장식은 최소화하되 종이의 따뜻함과 잉크의 깊이로 개성을 낸다. 이 블로그의 주인공은 화려한 UI가 아니라 "손민기의 개발 이야기·스펙·이력서 재료"다.

colors:
  # 만년필 잉크블루 (인터랙션/포인트)
  primary: "#4a6fa5"
  primary-dark: "#3a5687"
  primary-on-dark: "#7b9cc4"
  # 종이 (배경/표면)
  paper-canvas: "#faf7f0"
  paper-card: "#fffffb"
  paper-summary: "#f4f0e6"
  # 잉크 (텍스트)
  ink: "#3d3a36"
  ink-strong: "#2f2c28"
  ink-body: "#4d4842"
  ink-muted: "#8c8579"
  ink-faint: "#a9a294"
  # 괘선/경계
  rule-line: "#e8e1d3"
  rule-line-soft: "#f0eadc"
  # 태그 (연한 잉크블루 메모지)
  chip-bg: "#e3e9f2"
  chip-ink: "#3a5687"
  # 밤의 가죽 노트 (다크 모드)
  night-canvas: "#1f1b16"
  night-card: "#2a251e"
  night-summary: "#322c24"
  night-ink: "#ede6d6"
  night-ink-body: "#d8d0bf"
  night-ink-muted: "#a89f8c"
  night-rule: "#3a3329"
  night-chip-bg: "#34425a"
  night-chip-ink: "#c7d5ea"

typography:
  # 손글씨 (메뉴·제목)
  menu:
    fontFamily: "Gaegu, Gowun Dodum, cursive"
    fontSize: 25px
    fontWeight: 700
    note: "로고/네비게이션. 모바일 21px."
  tab:
    fontFamily: "Gaegu, Gowun Dodum, cursive"
    fontSize: 19px
    fontWeight: 700
    note: "카테고리 탭."
  section-head:
    fontFamily: "Gaegu, Gowun Dodum, cursive"
    fontSize: 30px
    fontWeight: 700
    note: "About의 Timestamps/Projects 같은 섹션 제목."
  # 가독성 (본문)
  hero:
    fontFamily: "Gowun Dodum, Pretendard, sans-serif"
    fontSize: 40px
    fontWeight: 400
    lineHeight: 1.2
    note: "홈 인사말. 모바일 32px."
  post-title:
    fontFamily: "Gowun Dodum, Pretendard, sans-serif"
    fontSize: 18px
    fontWeight: 600
    note: "포스트 카드 제목 — 목록 가독성 위해 손글씨 아님."
  body:
    fontFamily: "Gowun Dodum, Pretendard, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.7
    note: "마크다운 본문. 한국어 장문 기준."
  caption:
    fontFamily: "Gowun Dodum, Pretendard, sans-serif"
    fontSize: 13px
    fontWeight: 400
    note: "카드 발췌, 날짜, 메타."
  code:
    fontFamily: "SFMono-Regular, Consolas, Menlo, monospace"
    note: "코드 블록은 항상 모노스페이스 — 손글씨 금지."

rounded:
  none: 0px
  sm: 8px
  md: 11px
  card: 8px
  pill: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  section: 80px

components:
  global-nav:
    backgroundColor: "{colors.paper-canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.menu}"
    height: 60px
    note: "로고 + about/posts/archive + 검색. 손글씨, 보더 없음."
  category-tab:
    textColor: "{colors.ink-muted}"
    typography: "{typography.tab}"
    selected-bg: "{colors.paper-summary}"
    rounded: "{rounded.sm}"
  post-card:
    backgroundColor: "{colors.paper-card}"
    border: "1px solid {colors.rule-line}"
    rounded: "{rounded.card}"
    padding: 20px
    title: "{typography.post-title}"
    excerpt: "{typography.caption} · 3줄 클램프 · pruneLength 120"
  resume-button:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: 14px 28px
    note: "About 상단 '이력서 보기' — 블로그의 목적지인 이력서로 가는 핵심 CTA."
  tag-chip:
    backgroundColor: "{colors.chip-bg}"
    textColor: "{colors.chip-ink}"
    rounded: "{rounded.pill}"
  blockquote:
    border-left: "3px solid {colors.primary}"
    note: "일기장 메모처럼 잉크블루 괘선."
---

## Overview

이 블로그는 **손으로 눌러쓴 개발 일기장**이다. 크림빛 종이(`{colors.paper-canvas}`) 위에 만년필 잉크블루(`{colors.primary}`)로 기록한다. 화려한 그라데이션이나 그림자 대신, 종이의 따뜻한 질감과 손글씨의 정겨움으로 개성을 낸다.

핵심은 **이중 폰트 시스템**이다. 길을 안내하는 메뉴와 제목은 삐뚤빼뚤 정겨운 손글씨 **Gaegu(개구체)** 로, 오래 읽어야 하는 본문은 둥글고 편안한 **Gowun Dodum(고운돋움)** 으로 쓴다. 손글씨는 "말 거는 부분"에만, 가독성 폰트는 "읽는 부분"에 — 이 경계는 깨지 않는다.

**핵심 특징:**
- 종이 ↔ 잉크의 단 두 축. 인터랙션 색은 잉크블루 하나뿐(제2 강조색 없음).
- 메뉴/탭/섹션 제목 = 손글씨(Gaegu), 본문/카드제목/발췌 = 가독성(Gowun Dodum).
- 낮(크림 종이)과 밤(가죽 노트 `{colors.night-canvas}`) 두 모드. 밤에도 따뜻한 세피아 계열 유지.
- 코드 블록만은 예외 — 항상 모노스페이스, 손글씨 금지.
- 장식 최소. 경계는 종이 괘선 톤(`{colors.rule-line}`)의 얇은 선으로만.

## Colors

### 잉크 (인터랙션)
- **잉크블루** (`{colors.primary}` — #4a6fa5): 모든 링크·버튼·포인트. 만년필로 적은 듯한 차분한 파랑. 이 블로그의 유일한 강조색.
- **진한 잉크블루** (`{colors.primary-dark}` — #3a5687): hover/active.
- **밝은 잉크블루** (`{colors.primary-on-dark}` — #7b9cc4): 밤 모드에서 어두운 종이 위 링크.

### 종이 (표면)
- **크림 캔버스** (`{colors.paper-canvas}` — #faf7f0): 기본 배경. 약간 노란 따뜻한 종이.
- **밝은 종이 카드** (`{colors.paper-card}` — #fffffb): 포스트 카드·컨테이너. 캔버스보다 한 톤 밝아 카드가 떠 보인다.
- **연한 크림** (`{colors.paper-summary}` — #f4f0e6): 요약 박스·선택된 탭·표 줄무늬.

### 잉크 (텍스트)
- **잉크** (`{colors.ink}` — #3d3a36): 제목. 순흑 대신 갈색기 도는 차콜로 "인쇄물이 아닌 손글씨" 느낌.
- **본문 잉크** (`{colors.ink-body}` — #4d4842): 문단.
- **흐린 잉크** (`{colors.ink-muted}` — #8c8579): 날짜·메타·muted.

### 괘선
- **괘선** (`{colors.rule-line}` — #e8e1d3): 카드 보더·구분선. 공책 줄 같은 톤.

### 밤의 가죽 노트 (Dark)
짙은 세피아(`{colors.night-canvas}` — #1f1b16) 바탕에 크림 잉크(`{colors.night-ink}` — #ede6d6). 밤에도 차가운 회색으로 가지 않고 가죽 노트의 온기를 지킨다.

> **그라데이션 없음.** 깊이는 종이↔카드의 미묘한 명도차와 얇은 괘선으로만 만든다.

## Typography

### Font Family
- **손글씨 (메뉴·제목)**: `Gaegu, Gowun Dodum, cursive` — 연필로 눌러쓴 손글씨. 로고, 네비게이션, 카테고리 탭, 섹션 제목. Gaegu는 작게 렌더되는 편이라 본문 대비 +2~4px 키운다.
- **가독성 (본문)**: `Gowun Dodum, Pretendard, sans-serif` — 둥근 고딕. 본문, 카드 제목, 발췌, 메타. 장문에서도 눈이 편하다.
- **코드**: `SFMono-Regular, Consolas, Menlo, monospace` — 코드 블록·인라인 코드. 절대 손글씨로 바꾸지 않는다.

### Principles
- **손글씨는 "안내", 가독성은 "내용".** 메뉴/탭/섹션 제목만 Gaegu. 사용자가 오래 머무는 본문은 무조건 Gowun Dodum.
- **포스트 카드 제목은 가독성 폰트.** 목록은 스캔이 잦아 손글씨면 피로하다. 제목은 Gowun Dodum 600.
- **본문 line-height 1.7.** 한국어 장문 일기장 호흡.
- **Gaegu는 키워서.** 메뉴 25px(모바일 21px), 탭 19px, 섹션 제목 30px.

## Layout

- **콘텐츠 최대폭**: 720px (`$content-max-width`). 일기장 한 페이지 폭.
- **간격**: 8px 베이스. 카드 패딩 20px, 섹션 위아래 80px.
- **여백 철학**: 종이의 여백을 아끼지 않는다. 글이 숨 쉴 공간을 둔다.

## Components

- **global-nav** (`{component.global-nav}`): 크림 배경, 보더 없음, 손글씨 메뉴. 로고는 홈으로.
- **post-card** (`{component.post-card}`): 밝은 종이 카드 + 괘선 보더 + 8px 라운드. 제목(가독성) → 발췌 3줄(120자) → 날짜·태그.
- **resume-button** (`{component.resume-button}`): About 상단의 잉크블루 채움 버튼. **이 블로그가 향하는 목적지 = 이력서로 가는 가장 중요한 길.**
- **tag-chip** (`{component.tag-chip}`): 연한 잉크블루 메모지 알약.
- **blockquote**: 잉크블루 좌측 괘선 — 일기장 여백 메모처럼.

## Do's and Don'ts

### Do
- 인터랙션은 전부 잉크블루(`{colors.primary}`) 하나로.
- 메뉴·탭·섹션 제목은 Gaegu, 본문·카드제목은 Gowun Dodum — 경계를 지킨다.
- 깊이는 종이↔카드 명도차 + 얇은 괘선으로.
- 다크 모드는 가죽 노트의 따뜻한 세피아로(차가운 회색 금지).

### Don't
- 제2 강조색을 들이지 않는다.
- 코드 블록/인라인 코드를 손글씨로 바꾸지 않는다.
- 본문(장문)을 Gaegu로 쓰지 않는다 — 가독성 붕괴.
- 장식용 그라데이션·과한 그림자를 쓰지 않는다.

## Image & Screenshot Quality Gate

블로그 본문에 **스크린샷/이미지를 첨부하기 전 반드시 최소 화질을 검증**한다. 흐릿하거나 깨진 이미지는 일기장의 신뢰를 떨어뜨린다.

**첨부 전 체크리스트:**
- **최소 해상도**: 본문 폭이 720px이므로 가로 **1440px 이상**(2x 레티나)을 권장, 최소 720px. 그 이하는 업스케일 금지.
- **포맷**: 스크린샷은 PNG(텍스트·UI 선명), 사진은 WebP/JPEG.
- **파일 크기 / 압축 아티팩트**: 과압축으로 글자가 뭉개졌는지 100% 확대로 확인.
- **가독성**: 캡처 안의 글자가 읽히는가? 안 읽히면 크롭하거나 다시 캡처.
- **검증 방법**: 첨부 직전 이미지 dimension을 확인한다.
  ```bash
  # 가로폭(px) 확인 — 720 미만이면 재촬영
  sips -g pixelWidth -g pixelHeight 이미지.png
  ```

> 자동 캡처(Playwright 등)로 스크린샷을 만들 때도 동일 게이트를 통과시킨 뒤에만 본문에 넣는다.

## 블로그의 주체성 (Why)

이 블로그의 주인공은 디자인이 아니라 **손민기의 개발 이야기다.** 모든 글과 페이지는 결국 세 가지를 위한 재료다:

1. **개발 이야기** — 무엇을, 왜, 어떻게 풀었는가의 서사.
2. **스펙** — 다룬 기술·규모·성과를 증명 가능한 형태로.
3. **이력서 재료** — 글 하나하나가 나중에 이력서/포트폴리오로 모인다.

→ 디자인 결정이 이 목적과 충돌하면 **목적이 이긴다.** (예: 귀여움보다 본문 가독성, 장식보다 이력서 CTA의 명확함.) About 페이지의 "이력서 보기" 버튼이 가장 잘 보여야 하는 이유다.
