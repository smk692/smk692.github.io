---
layout: post
emoji: 🔖
title: 헥사고날 WMS 재활 2일차 — Version Catalog
date: '2026-06-11 00:00:01'
author: 손(Son/손민기)
tags: WMS Gradle Kotlin 버전카탈로그 코딩재활치료
categories: 코딩재활치료
---

> 이미 알고 있는 것을 손으로 다시 짜는 재활. 2일차는 Gradle Version Catalog.

## PR

- [chore: add gradle version catalog](https://github.com/smk692/wms/pull/2)

## 오늘 한 것

- 의존성 버전을 `gradle/libs.versions.toml` 한 곳에 모음
- `versions` / `libraries` / `plugins` 3개 섹션 구성
- 모듈에서 `libs.xxx` 로 참조하도록 전환
- Spring Boot BOM 이 관리하는 의존성은 버전 생략
- deprecated 된 opensearch-rest-client 제거, opensearch 버전 통일

## Version Catalog 구조

**3개 섹션**

- `[versions]` — 버전 숫자만 모으는 곳
- `[libraries]` — `group:artifact` + `version.ref` 연결
- `[plugins]` — 플러그인 id + 버전

```toml
[versions]
kotlin = "2.1.0"

[libraries]
kotest-runner = { module = "io.kotest:kotest-runner-junit5", version.ref = "kotest" }

[plugins]
kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }
```

## library vs plugin

| | 플러그인 | 라이브러리 |
|---|---|---|
| 정체 | 빌드를 확장하는 도구 | 코드가 import 하는 의존성 |
| 식별자 | `id` | `module` = `group:artifact` |
| 섹션 | `[plugins]` | `[libraries]` |

판별: 내 코드에서 `import` 하면 library, 빌드 행위(컴파일/패키징)를 바꾸면 plugin.

## BOM 위임

Spring Boot 의 `spring-boot-dependencies` 를 platform 으로 import 하면, starter 들의 버전을 한 곳에서 고정한다. 카탈로그에서는 version 을 생략하고 BOM 에 맡긴다.

```toml
spring-webflux = { module = "org.springframework.boot:spring-boot-starter-webflux" }
```

## 고민 내용

> "의존성 버전을 단일 카탈로그로 모아 멀티모듈 버전 드리프트를 차단함"

```toc
```
