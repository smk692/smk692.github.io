---
layout: post
emoji: 🏗️
title: 헥사고날 WMS 재활 1일차 — 멀티모듈 골격
date: '2026-06-11 00:00:00'
author: 손(Son/손민기)
tags: WMS Gradle Kotlin 헥사고날 멀티모듈 코딩재활치료
categories: 코딩재활치료
---

> 이미 알고 있는 것을 손으로 다시 짜는 재활. 1일차는 Gradle 멀티모듈 골격.

## PR

- [chore: scaffold multi-module skeleton](https://github.com/smk692/wms/pull/1)

## 오늘 한 것

- `com.mingi.wms` 10모듈 Gradle(Kotlin DSL) 멀티모듈 골격 구성
- `./gradlew projects` / `./gradlew build` 통과 확인
- domain 모듈에 spring import 시 컴파일 에러 직접 확인

## 모듈 구조

| 모듈 | 역할 |
|---|---|
| `modules/common` | 공통 유틸/에러 |
| `modules/core/domain` | 순수 도메인 (의존성 0) |
| `modules/core/usecase` | UseCase + Port |
| `modules/infrastructure/r2dbc` | RDS 어댑터 |
| `modules/infrastructure/opensearch` | 검색 어댑터 |
| `modules/infrastructure/redis` | 락/캐시 어댑터 |
| `modules/infrastructure/kafka` | 이벤트 발행/구독 |
| `modules/bootstrap/api` | REST API (Spring Boot main) |
| `modules/bootstrap/worker` | Kafka 컨슈머 · @SchedLock |
| `modules/bootstrap/batch` | 대용량 잡 |

## 핵심 설계 포인트

**domain 의존성 0**
- `build.gradle.kts`에 spring 의존성 없음
- `import org.springframework.stereotype.Component` 추가 시 즉시 빌드 실패
- "의존하지 않는다"를 컨벤션이 아니라 컴파일 에러로 강제

**api / worker / batch 분리**
- 장애 격리: worker 다운 시 api 무관
- 배포 단위 분리 가능
- 지금은 골격만, C6에서 worker/batch 채움

**루트 `build.gradle.kts` 구조**
```kotlin
plugins {
    kotlin("jvm") version "1.9.25" apply false
}

subprojects {
    repositories {
        mavenCentral()
    }
}
```
- `apply false` — 버전 선언만, 각 모듈이 직접 apply
- `subprojects` — 저장소 설정을 루트에서 일괄 관리

## 막힌 점 (STAR)

| | |
|---|---|
| **S** | `./gradlew build` → `Cannot resolve kotlin-stdlib` |
| **T** | 전체 모듈에 `mavenCentral()` 적용 필요 |
| **A** | `subprojects { }` 를 `plugins { }` 안에 넣는 실수 |
| **R** | `plugins { }` 밖으로 꺼내 해결 |

## 다음에 추가할 것

- **ktlint + detekt** — 루트 공통 lint 규칙, CI 연동
- **ArchUnit** — domain 의존성 0 · 헥사고날 방향 위반을 테스트 코드로 검증

## 배운 것 한 줄

> "헥사고날 의존성 방향은 빌드 모듈 경계로 강제할 때 비로소 지켜진다."

```toc
```
