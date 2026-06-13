---
layout: post
emoji: 🩺
title: 헥사고날 WMS 재활 4일차 — compose + 헬스체크 + 공통 응답 규격
date: '2026-06-13 00:00:03'
author: 손(Son/손민기)
tags: WMS SpringBoot WebFlux Docker Kotlin 헥사고날 코딩재활치료
categories: 코딩재활치료
---

> 이미 알고 있는 것을 손으로 다시 짜는 재활. 4일차는 로컬 인프라 + 첫 엔드포인트 + 응답/에러 규격.

## PR

- [feat: bootstrap api with compose, health, 응답·에러 규격](https://github.com/smk692/wms/pull/5)

## 오늘 한 것

- compose 로컬 4종(postgres/redis/opensearch/kafka) + healthcheck + 데이터 볼륨
- Makefile 실행 스크립트(`infra-up`/`api`/`build`)
- 부트스트랩 3종 `application.yaml` + `application-local.yaml`
- `GET /health` (WebFlux suspend)
- 에러 응답 규격 `ErrorResponse` + 에러 분류 `ErrorType` + `GlobalExceptionHandler`

## compose

- 4 컨테이너 한 파일. 핵심은 healthcheck + `--wait`
- healthcheck 없으면 `up -d` 는 "컨테이너 떴다"까지만 보장 → postgres 가 아직 접속 못 받는데 api 먼저 붙어 죽음
- healthcheck 달면 `--wait` 가 healthy 까지 대기 → `make api` 한 줄로 인프라→앱 순서 보장

```bash
infra-up:
	docker compose up -d --wait
```

## 설정은 부트스트랩만 소유

"인프라 모듈(r2dbc/redis)에도 `application.yaml` 둬야 하나?" → 아니다.

| 모듈 | 역할 | 설정 |
|---|---|---|
| infrastructure/* | 라이브러리(어댑터) | 키만 정의(`@ConfigurationProperties`) |
| bootstrap/* | 실행 단위 | 값 소유(`application.yaml`) |

- 인프라 모듈에 yaml 넣으면 그걸 쓰는 모든 부트스트랩 클래스패스에 같이 올라감
- Spring Boot 는 클래스패스 `application.yaml` 을 하나만 집음 → 부트스트랩 자기 설정과 충돌(어느 쪽 잡힐지 비결정적)
- 그래서 라이브러리는 값을 안 가진다
- 마이그레이션 주체도 api 하나로 고정. worker/batch 는 스키마 소비만 → `flyway.enabled: false`

## /health — WebFlux suspend

```kotlin
@RestController
class HealthController {
    @GetMapping("/health")
    suspend fun health(): Map<String, String> = mapOf("status" to "ok")
}
```

- 한 줄짜리지만 `suspend` 가 붙음
- WebFlux 는 Netty 이벤트 루프(소수 스레드)에서 논블로킹 처리. `suspend` 면 코루틴이 스레드 점유 안 하고 양보 가능
- 지금은 바로 반환이라 차이 없음. C1 부터 DB 호출 들어오면 이 한 글자가 블로킹/논블로킹을 가름 → 골격에서 컨벤션 박아둠

## 응답 규격 — 성공은 리소스, 실패만 규격화

성공/실패를 한 봉투(`{success, data, error}`)로 싸는 방식도 있는데 안 씀. `success: true` 는 HTTP status 가 이미 주는 신호라 중복이고, 성공 바디는 엔드포인트마다 DTO 가 달라 공통 봉투로 싸도 이득이 적음. 반대로 **에러는 전 엔드포인트 공통 계약**이라 규격화 이득이 여기 쏠림.

- 성공: 리소스 그대로 반환 + 2xx (`/health` → `{"status":"ok"}`)
- 실패: 공통 `ErrorResponse` + 4xx/5xx

```kotlin
// 실패만 규격화. 성공은 컨트롤러가 DTO 직접 반환
data class ErrorResponse(
    val code: String,
    val message: String,
)
```

```
성공  200  { ...리소스 DTO... }
실패  4xx  { "code": "SKU_NOT_FOUND", "message": "..." }
```

- 성공/실패 신호 = HTTP status. body 에 중복 플래그 안 둠
- 에러는 자유 문자열 아니라 코드로 → 프론트가 인터셉터 하나로 code 매핑
- 절대 안 함: "전부 200 + body 로 실패 표현". status 죽이면 캐시·모니터링·리트라이 다 망가짐

## ErrorType — HTTP 를 모르는 분류

에러 분류 enum 을 어디 둘까. gRPC `Status.Code`, Spring `HttpStatus` 같은 표준품 있지만 안 씀.

- `common` 은 프레임워크 의존 0 이 원칙 → 직접 정의
- `HttpStatus` 를 common 에 들이면 `common → spring` 의존 생김 → "common 은 어떤 레이어도 모른다" ArchUnit 규칙 깨짐

```kotlin
enum class ErrorType {
    INVALID, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, UNAVAILABLE, INTERNAL
}
```

- 도메인/유스케이스 예외는 "CONFLICT 다"라는 분류까지만 안다. 409 라는 숫자는 모름

## GlobalExceptionHandler — 상태 매핑 단일 지점

ErrorType → HTTP 상태 변환은 이 어댑터 한 곳에만.

```kotlin
@RestControllerAdvice
class GlobalExceptionHandler {
    @ExceptionHandler(WmsException::class)
    fun handle(e: WmsException) =
        ResponseEntity.status(e.errorType.toHttpStatus())
            .body(ErrorResponse(e.errorCode, e.message ?: e.errorCode))
}
```

- 진입점 늘어나도(gRPC, 메시징) 코어 모듈 무변경. HTTP 아는 건 api 어댑터뿐
- `ResponseEntityExceptionHandler` 상속 방법 있지만 의도적으로 안 씀
  - WebFlux 는 프레임워크 예외(405/415/바인딩)가 대부분 `ResponseStatusException` 하위 타입 → 폴백 핸들러 하나로 커버. 매핑 없는 경로 404 도 우리 `ErrorResponse` 규격으로 나오는 거 실측
  - 상속하면 `ProblemDetail`(RFC 9457)이 들어와 우리 `ErrorResponse` 랑 이중 규격 됨
  - 외부 공개 API 로 표준 포맷 필요해지면 그때 전환

## 막힌 점 1 — opensearch 3.x 즉사

- 증상: 카드 스펙 2.17 을 최신 3.7 로 올리니 컨테이너 `exit(1)` 즉사
- 원인: 2.17 에서 쓰던 `plugins.security.disabled` 만으론 entrypoint 가 인지 못함 → 데모 보안 스크립트 돌며 `OPENSEARCH_INITIAL_ADMIN_PASSWORD` 요구하고 종료
- 조치: entrypoint 가 읽는 env 로 교체

```yaml
environment:
  discovery.type: single-node
  DISABLE_SECURITY_PLUGIN: "true"
  DISABLE_INSTALL_DEMO_CONFIG: "true"
```

- 결과: healthy + cluster green. 설정 키가 "앱이 읽는 것" vs "컨테이너 entrypoint 가 읽는 것"으로 갈린다는 거 체감

## 막힌 점 2 — api vs implementation

3일차에 정리한 주제가 실전으로 돌아옴.

- 증상: `UseCaseException` 이 common `WmsException` 을 public 상속하자, api 모듈에서 `e.errorCode` 컴파일 안 됨
- 원인: usecase 가 common 을 `implementation` 으로 물어서. 상속한 타입은 usecase 의 공개 표면(ABI)인데 `implementation` 은 소비 모듈에 전파 안 함
- 조치: `api` 로 변경

```kotlin
// modules/core/usecase/build.gradle.kts
api(project(":modules:common"))   // 상속 = ABI 노출 → api
```

- 결과: 통과. 단 `api`/`implementation` 은 전이 노출 범위지 의존 방향 아님. 화살표는 `usecase → common` 그대로, common 은 usecase 모름
- 함정: Gradle 의 `api` 설정 이름이 우리 `bootstrap/api` 모듈이랑 겹쳐서 헷갈림. 둘은 무관

## 다음에 추가할 것

- `WmsApiApplication` 에 `scanBasePackages = ["com.mingi.wms"]` — C1 에서 infra 에 `@Configuration` 생기면 필요
- `GlobalExceptionHandler` 단위 테스트(`@WebFluxTest`) — ErrorType → 상태코드 매핑 검증

## 고민 내용

> "성공은 status + 리소스로, 실패만 공통 ErrorResponse 로 규격화함. 에러 분류는 프레임워크 무관한 코어에 두고 HTTP 상태 매핑은 어댑터 한 지점에 격리함. WebFlux 예외가 ResponseStatusException 계층으로 통일된 점을 근거로 ResponseEntityExceptionHandler 상속도 안 함"

```toc
```
