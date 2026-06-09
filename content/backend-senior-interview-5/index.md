---
layout: post
emoji: 🕸️
title: "시니어 백엔드 면접 질문 5편 - 분산/MSA 아키텍처 (5~10년차)"
date: '2026-06-09 12:00:00'
author: 손(Son/손민기)
tags: 백엔드 면접 시니어 분산시스템 MSA SAGA CQRS APIGateway DDD 아웃박스 꼬리질문
categories: CS
series: "시니어 백엔드 면접 질문"
---

5편은 **분산 시스템과 MSA 아키텍처**입니다. 면접관은 패턴 이름을 아는지보다 **언제 도입하고 어떤 비용을 감수했는지**를 봅니다.

**시리즈 구성:**
- 1편: 인프라/스케일링
- 2편: 운영/안정성
- 3편: 설계/리더십
- 4편: 동시성/런타임
- **5편 (현재)**: 분산/MSA 아키텍처
- 6편 (예정): 가용성/안정성 패턴

---

## 1. SAGA 패턴

### Q1. MSA에서 트랜잭션을 어떻게 처리하시나요?

**기대 답변:**
2PC는 락이 길어져 부적합하기 때문에 **SAGA**(보상 트랜잭션 릴레이)를 씁니다.
- **Choreography**: 각 서비스가 이벤트를 듣고 자기 단계 처리
- **Orchestration**: 중앙 조정자가 단계별 호출

선택 기준은 서비스 수와 흐름 복잡도입니다. 단순 흐름은 Choreography, 가시성·복구가 중요하면 Orchestration.

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 항공 예약 흐름 — 결제 → 좌석 확보 → 마일리지 적립 → 항공사 발권 4단계 분산 서비스.

**Orchestration SAGA 설계:**
```
SagaOrchestrator
  step 1: 결제 (Payment Service)
    compensate: 환불
  step 2: 좌석 확보 (Seat Service)
    compensate: 좌석 해제
  step 3: 마일리지 적립 (Mileage Service)
    compensate: 마일리지 차감
  step 4: 항공사 발권 (Airline Adapter)
    compensate: 발권 취소 요청
```

**실제 장애 사례 — 마일리지 적립 실패:**

| 시점 | 이벤트 |
|---|---|
| T+0s | 결제 성공 |
| T+1s | 좌석 확보 성공 |
| T+2s | 마일리지 서비스 timeout |
| T+3s | Orchestrator가 step 1, 2 보상 시작 |
| T+3s | 좌석 해제 성공 |
| T+4s | **환불 호출 실패** (PG사 일시 장애) |
| T+4s | 환불 retry 3회 모두 실패 → **DLQ로 격리** |
| T+5s | 운영 알람 발생 (PagerDuty) |

**DLQ 처리:**
- 운영 콘솔에서 사가 ID로 조회 → 보상 실패 단계 확인
- 멱등키로 환불 재실행 (PG사 복구 후 수동 트리거)
- 정합성 회복 시간: 평균 15분, 최대 2시간

**Choreography로 했다면?**
- 같은 시나리오에서 *누가 보상을 책임지는지 모호*
- 이벤트 흐름 디버깅이 어려워 RCA 시간 3배 증가
- 운영 가시성 = Orchestration이 압도적

**교훈:**
- **단계가 4개 넘고 보상이 복잡하면 Orchestration**
- 보상 자체가 실패할 수 있음을 가정 → **DLQ + 운영 콘솔이 SAGA의 절반**
- 사가 ID 기반의 모든 단계 추적이 *운영의 마지막 보루*

</details>

### 🔄 꼬리질문 1: 보상 트랜잭션 자체가 실패하면 어떻게 하나요?

**기대 답변:**
- 재시도 정책 (지수 백오프 + jitter, 최대 N회)
- **DLQ(Dead Letter Queue)**로 격리, 운영 알람
- 멱등키 기반 수동 재처리 콘솔

핵심은 **eventual consistency 윈도우를 명시적으로 정의**하는 것입니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

PG사 일시 장애로 환불 보상 실패 → DLQ에 격리, 운영 콘솔에서 사가 ID 조회 + 멱등키로 수동 재실행. 평균 회복 15분. **교훈: 보상 실패까지 가정한 *운영 콘솔*이 SAGA의 절반.**

</details>

### 🔄 꼬리질문 2: Choreography의 단점은?

**기대 답변:**
- 흐름이 코드 여러 곳에 흩어져 **추적 어려움**
- 새 단계 추가 시 의존 서비스 모두 인지해야
- 분산 트레이싱 없으면 디버깅 비용 폭증

→ 흐름이 5단계 넘으면 Orchestration으로 전환 권장.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

Choreography 7단계 흐름 디버깅에 *어디서 멈췄는지* 추적만 1시간. Orchestration으로 전환 + 사가 ID 기반 대시보드 → 1분 내 진단. **교훈: 흐름 5단계 넘으면 *반드시* Orchestration.**

</details>

### 🔄 꼬리질문 3: SAGA vs Outbox 패턴 차이는?

**기대 답변:**
- **SAGA**: 분산 트랜잭션 *흐름* 패턴 (보상)
- **Outbox**: 로컬 트랜잭션과 이벤트 발행을 *원자적*으로 묶는 패턴

둘은 보완 관계입니다. SAGA 각 단계에서 이벤트 발행의 신뢰성을 Outbox로 보장.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

SAGA 도입 직후 *이벤트 유실*로 보상 안 됨 — Outbox 추가해 단계별 이벤트 원자성 보장. 유실 0건. **교훈: SAGA의 신뢰성은 *Outbox로 받침*해야 완전.**

</details>

---

## 2. CQRS

### Q2. CQRS는 언제 도입하시나요?

**기대 답변:**
명령(Command)과 조회(Query)의 **데이터 모델·저장소 요구가 달라질 때**입니다.
- 조회 쪽이 복잡 집계·검색이고 쓰기보다 빈도가 훨씬 높음
- 쓰기 모델이 도메인 규칙으로 무거운데 조회 응답속도 SLO가 엄격

도입 비용은 프로젝션 갱신 지연(eventual consistency)과 운영 복잡도입니다.

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 셀러 대시보드 — 정규화된 OLTP DB에서 매번 5개 테이블 조인 + GROUP BY. 응답 8초, 셀러 1만 명 동시 접속 시 DB 멈춤.

**문제 분석:**
- 쓰기 모델은 정규화가 옳음 (주문 INSERT는 단일 row)
- 조회 모델은 *셀러별 일/주/월 집계*가 필요
- 같은 테이블이 두 요구를 동시에 만족 불가

**CQRS 도입:**

**Write side (기존 유지):**
- PostgreSQL OLTP
- 주문·결제·환불 정규화 모델

**Read side (신규):**
- ClickHouse (OLAP)
- 셀러별 일별 집계 테이블 (pre-aggregated)
- 응답 50ms

**프로젝션 파이프라인:**
```
Order Service (PG) 
  → Debezium CDC
  → Kafka topic: order.events
  → Kafka Streams aggregator
  → ClickHouse
```

**일관성 윈도우:**
- 정상: 2~5초 lag
- 피크: 15초 lag
- 셀러 화면에 "데이터 갱신: 방금 전" 표시

**Read Your Writes 처리:**
- 셀러가 *방금 자기 행동*을 봐야 하는 화면(예: "방금 등록한 상품")은 OLTP 직접 조회
- 집계 화면만 ClickHouse 사용

**결과:**
- 대시보드 응답: 8초 → 50ms (160배)
- OLTP CPU: 80% → 25%
- 셀러 만족도 NPS +12점

**비용:**
- ClickHouse + Kafka + Debezium 인프라
- 운영 복잡도 (lag 모니터링, 재처리 시나리오, 스키마 동기화)
- 팀의 학습 곡선 약 2개월

**교훈:**
- CQRS는 *단순 분리*가 아니라 *조회 모델 재설계 기회*
- 일관성 윈도우를 사용자가 인지할 수 있게 UI에 표시
- 도입 비용이 크므로 *진짜 필요한 도메인*만 (전체 시스템 X)

</details>

### 🔄 꼬리질문 1: 일관성 윈도우는 어떻게 다루나요?

**기대 답변:**
- 사용자 화면에서 *자기 변경 사항*은 즉시 보여야 함 → **Read Your Writes**: 쓰기 직후 잠시 마스터에서 조회
- 외부 알림에는 프로젝션 완료 후 전송
- 운영 메트릭으로 lag(p99) 지표화

<details>
<summary>📋 <b>사례</b></summary>

<br/>

상품 등록 직후 셀러 화면이 ClickHouse 프로젝션 lag 5초로 *빈 화면* 표시 → 본인 행동 직후는 OLTP fallback. 사용자 혼란 사라짐. **교훈: Read Your Writes는 *본인 행동만 즉시 반영*하는 패턴.**

</details>

### 🔄 꼬리질문 2: Event Sourcing과 같이 가야 하나요?

**기대 답변:**
아닙니다. CQRS는 *모델 분리*, Event Sourcing은 *상태 표현*입니다.
- CQRS만 도입: 일반 RDB + 별도 read DB
- ES까지 도입: 감사/재구성이 필요할 때만 (운영 부담 큼)

대부분은 CQRS만 도입해도 효과가 충분합니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

CQRS는 도입했지만 ES는 *명시적으로 거부* — 결제 외 도메인은 감사 요구 없음. 운영 단순성 유지. **교훈: ES는 *진짜 감사 요구사항*이 있을 때만, 멋있어 보여서 도입은 안티패턴.**

</details>

### 🔄 꼬리질문 3: 프로젝션 갱신은 어떻게 안정화하나요?

**기대 답변:**
- CDC(Debezium 등)로 카프카에 변경 흘리고 컨슈머가 read DB 갱신
- 멱등 처리 + 순서 보장(파티션 키 = aggregate id)
- 실패 시 재처리 가능하도록 오프셋·DLQ 관리

<details>
<summary>📋 <b>사례</b></summary>

<br/>

Debezium + Kafka로 CDC 파이프라인. 컨슈머 재시작 시에도 *오프셋 기반 재처리*로 데이터 정합성 보장. lag p99는 Datadog 알람. **교훈: CDC는 *재처리 시나리오*까지 설계해야 운영 안정.**

</details>

---

## 3. API Gateway 패턴

### Q3. API Gateway에 어디까지 책임을 두시겠어요?

**기대 답변:**
횡단 관심사만 둡니다.
- 인증·인가, 레이트 리밋, 라우팅, 응답 캐싱, 관측(trace ID 부여)

비즈니스 로직·집계는 두지 않습니다. BFF가 필요하면 별도 레이어로.

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** Spring Cloud Gateway 도입 후 6개월. 외부 API 80개를 게이트웨이 단일 진입점으로 통합. 어느 날 게이트웨이가 단일 장애점이 됨.

**장애 발생:**
- 한 백엔드 서비스의 응답이 30초로 지연
- 게이트웨이의 reactor netty 이벤트 루프 점유율 100%
- 무관한 80개 API 전부 5xx

**원인:**
- 게이트웨이에 *서킷 브레이커 없음*
- 한 백엔드의 지연이 게이트웨이 자체 자원을 잠식

**대응 (긴급 → 영구):**

**긴급 (장애 중):**
- 문제 백엔드 라우팅을 임시 차단 (`spring.cloud.gateway.routes` 필터)
- 게이트웨이 리스타트 → 자원 회복

**영구 (1주 작업):**
1. **Resilience4j 서킷 브레이커** 모든 라우트에 적용
   - 임계치: 에러율 30%, 슬로우 콜 비율 50% (p99 > 2s)
2. **Bulkhead**: 백엔드별 동시성 상한 (semaphore-based)
3. **인스턴스 다중화**: 2 → 6, 무상태 + L7 LB
4. **JWT 검증 캐시**: ID provider 의존도 축소 (Redis 5분 TTL)

**관측 강화:**
- 라우트별 p99, 에러율 대시보드
- 서킷 Open 발생 시 Slack 알림
- 인증 캐시 hit ratio 모니터링

**결과:**
- 다음 백엔드 지연 발생 시 *해당 라우트만 격리*, 나머지 정상
- 인증 캐시로 ID provider QPS 90% 감소

**교훈:**
- 게이트웨이는 *편의 도구*가 아니라 *모든 의존성의 집중점*
- **서킷 브레이커 + Bulkhead + 다중화**가 게이트웨이의 3종 세트
- "게이트웨이를 도입했는데 회복력이 줄었다"는 신호면 즉시 점검

</details>

### 🔄 꼬리질문 1: 단일 장애점 위험은 어떻게 줄이나요?

**기대 답변:**
- 다중 인스턴스 + 무상태 + L4/L7 LB
- 게이트웨이 자체에 서킷 브레이커
- 인증 캐시(JWT 검증 결과)로 ID provider 의존도 축소

<details>
<summary>📋 <b>사례</b></summary>

<br/>

게이트웨이 2대 → 6대로 확장 + 무상태로 유지. 한 대 다운에도 트래픽 영향 0. JWT 검증 결과 Redis 5분 캐시로 ID provider 부하 90% 감소. **교훈: 게이트웨이도 *마이크로서비스처럼* 다중화 + 캐시.**

</details>

### 🔄 꼬리질문 2: 게이트웨이가 병목이 될 때 어떤 신호를 보나요?

**기대 답변:**
- 게이트웨이 p99 vs 백엔드 p99 격차
- 커넥션 풀 사용률, keep-alive 재사용률
- TLS 핸드셰이크 비율(0-RTT/session resumption 적용 효과)

<details>
<summary>📋 <b>사례</b></summary>

<br/>

백엔드 p99 100ms인데 게이트웨이 p99 800ms → reactor netty 이벤트 루프 100% → 라우트별 Bulkhead로 자원 격리. p99 동일화. **교훈: *게이트웨이 vs 백엔드 격차*가 가장 명확한 병목 신호.**

</details>

### 🔄 꼬리질문 3: 게이트웨이 vs Service Mesh, 어떻게 나누나요?

**기대 답변:**
- **게이트웨이**: 외부 트래픽 입구 (north-south)
- **Service Mesh**: 내부 서비스 간 (east-west) — mTLS, 재시도, 트래픽 분할

둘은 보완. 작은 조직은 게이트웨이만으로 시작, 서비스 50+ 넘으면 Mesh 검토.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

서비스 60개 도달 시점에 Linkerd 도입 — 자동 mTLS + 재시도 + 트래픽 분할. 게이트웨이는 north-south만 담당. **교훈: 50+ 서비스는 *Mesh가 운영 비용*보다 절감 효과가 큼.**

</details>

---

## 4. DDD와 Bounded Context

### Q4. Bounded Context를 코드·팀·DB에 어떻게 반영하시나요?

**기대 답변:**
- **코드**: 모듈/패키지 경계 = 컨텍스트 경계. 다른 컨텍스트 객체 직접 import 금지
- **팀**: 한 컨텍스트는 한 팀의 결정권
- **DB**: 스키마 분리 (가능하면 인스턴스도). 공유 DB는 컨텍스트 경계를 깨뜨림

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 1만 명 규모 모놀리스에서 결제·정산 컨텍스트를 *모듈러 모놀리스* 형태로 분리.

**분리 전 문제:**
- 결제 도메인 객체가 `@Entity Order`와 직접 결합
- 정산 로직이 주문 테이블 조인으로 처리됨 → 정산 변경할 때마다 주문 모듈 영향
- 결제 PR이 평균 12개 모듈 수정 (불필요한 범위 확산)

**리팩토링 (3개월, 4단계):**

**Step 1 — 도메인 모듈 분리 (1개월)**
- `domain/payment/` 패키지 신설
- 결제 *도메인 객체*(`Payment`, `Refund`)를 ORM 엔티티에서 분리
- 매핑은 별도 `PaymentMapper`에 격리

**Step 2 — DB 스키마 격리 (1개월)**
- 결제 테이블을 별도 schema (`payment.*`)로 이전
- Cross-schema FK 제거, 대신 ID 참조만
- ACL(Anti-Corruption Layer)로 다른 컨텍스트와 통신

**Step 3 — 모듈 경계 강제 (3주)**
- ArchUnit으로 컨텍스트 간 직접 import 금지 규칙 추가
- CI에서 위반 시 빌드 실패
- 통신은 명시적 API (예: `PaymentFacade`) 또는 도메인 이벤트

**Step 4 — 팀 분리 (2주)**
- 결제 모듈 = 결제팀이 PR 승인권자
- 다른 팀은 PaymentFacade만 사용, 내부 변경은 결제팀 책임

**결과:**
- 결제 PR 평균 수정 모듈: 12개 → 2.5개
- 결제 도메인 단위 테스트 가능 (외부 의존성 mock)
- 향후 MSA 분리 시 *코드 이동만으로 가능* (DB도 이미 분리됨)

**예상치 못한 효과:**
- 결제팀이 *온콜 부담 감소* (다른 모듈 장애에 안 깨도 됨)
- 결제 도메인 ADR이 5개 작성됨 (그동안 암묵지로 흩어져 있었음)

**교훈:**
- **컨텍스트 경계는 코드만으로는 부족, DB·팀까지 정렬**되어야 진짜
- 모놀리스 안에서도 DDD가 충분히 의미 있음 (MSA 갈 필요 없음)
- ArchUnit 같은 *자동 강제*가 인간 규율보다 강력

</details>

### 🔄 꼬리질문 1: 컨텍스트 간 통신은 어떻게 하나요?

**기대 답변:**
- 비동기 도메인 이벤트 우선
- 동기 호출은 *오픈 호스트 서비스* 형태의 명시적 계약
- 직접 DB 조회는 금지 (Anti-Corruption Layer로 격리)

<details>
<summary>📋 <b>사례</b></summary>

<br/>

결제 → 정산 통신을 *결제 도메인 이벤트* (`PaymentCompleted`)로 전환. 정산 모듈은 이벤트만 구독, 결제 내부 변경에 영향 없음. **교훈: 이벤트는 *컨텍스트 간 결합도를 결정적으로 낮춤*.**

</details>

### 🔄 꼬리질문 2: 도메인 모델과 ORM 엔티티가 같아야 하나요?

**기대 답변:**
규모에 따라 다릅니다.
- 작은 도메인: 같아도 OK (`@Entity` = 도메인 객체)
- 복잡 도메인: 분리 (도메인 객체 + 영속 엔티티 + 매핑). 운영 부담은 늘지만 도메인 규칙이 ORM에 오염되지 않음

<details>
<summary>📋 <b>사례</b></summary>

<br/>

결제 도메인은 분리(`Payment` 도메인 + `PaymentEntity` ORM + Mapper), 단순한 알림 도메인은 `@Entity`만. 둘 다 정답. **교훈: *도메인 복잡도에 비례한* 추상화가 비용 효율.**

</details>

### 🔄 꼬리질문 3: 마이크로서비스로 분리하는 기준은?

**기대 답변:**
컨텍스트 경계가 분명하고 다음 중 둘 이상이면 분리:
- 배포 주기/팀이 다름
- 스케일 요구가 다름 (예: 결제는 5배, 카탈로그는 1배)
- 장애 격리 SLO가 다름

코드 모듈로 시작해 문제가 보일 때 분리하는 *모듈러 모놀리스 → MSA* 흐름이 안전합니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

모듈러 모놀리스 1년 운영 후 결제만 MSA로 분리 — 배포 주기·스케일·장애 SLO 모두 다름. 다른 모듈은 모놀리스 유지. **교훈: *전부 MSA*가 아니라 *진짜 필요한 도메인만* 분리.**

</details>

---

## 5. 모놀리스 내 도메인 이벤트와 아웃박스

### Q5. 같은 모놀리스 안 두 모듈을 직접 호출 대신 도메인 이벤트로 묶을 때 트랜잭션 경계는 어떻게 설계하나요?

**기대 답변:**
3축으로 정리합니다.
1. **이벤트 발행 시점 제어**: 커밋 후 발행 (`@TransactionalEventListener AFTER_COMMIT`)
2. **유실 방지**: **Outbox 패턴** — 같은 트랜잭션에 outbox 테이블 insert, 별도 릴레이가 발행
3. **실패 처리**: 재시도 + DLQ + 보상 트랜잭션

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 주문 모듈 → 알림·재고·통계 3개 컨슈머. 평소 잘 돌다가 한 달에 2~3건 *주문은 있는데 알림은 안 가는* 사고 발생.

**문제 코드 (Before):**
```kotlin
@Transactional
fun createOrder(req: OrderRequest): Order {
  val order = orderRepo.save(Order(...))
  
  // 🚨 같은 트랜잭션 안에서 Kafka 발행
  kafkaTemplate.send("order.created", order.toEvent())
  
  return order
}
```

**왜 유실되는가:**
- Kafka 발행은 성공했는데 트랜잭션 *커밋*이 실패 → 컨슈머는 이미 처리, DB에는 주문 없음
- 또는 Kafka 발행은 실패했는데 트랜잭션은 커밋 → DB에 주문 있는데 알림 안 감
- *분산 트랜잭션*은 답이 없음

**해결 — Outbox 패턴 (After):**
```kotlin
@Transactional
fun createOrder(req: OrderRequest): Order {
  val order = orderRepo.save(Order(...))
  
  // 같은 트랜잭션 안에 outbox 테이블 insert (DB 보장)
  outboxRepo.save(OutboxEvent(
    aggregateId = order.id,
    eventType = "order.created",
    payload = order.toEvent().toJson(),
    status = "PENDING"
  ))
  
  return order
}

// 별도 스케줄러가 outbox를 폴링해 Kafka 발행
@Scheduled(fixedDelay = 1000)
fun relay() {
  val pending = outboxRepo.findByStatus("PENDING", limit = 100)
  pending.forEach { event ->
    try {
      kafkaTemplate.send(event.eventType, event.payload).get(3, SECONDS)
      event.markPublished()
    } catch (e: Exception) {
      event.incrementRetry()
      if (event.retries > 5) event.moveToDLQ()
    }
  }
  outboxRepo.saveAll(pending)
}
```

**컨슈머 측 멱등성:**
```kotlin
@KafkaListener(topics = ["order.created"])
fun onOrderCreated(event: OrderCreatedEvent) {
  if (processedEventRepo.existsByEventId(event.id)) return  // 멱등
  
  sendNotification(event)
  processedEventRepo.save(ProcessedEvent(event.id))
}
```

**결과:**
- 유실 0건 (3개월간)
- 한 달 한 번 DB 마이그레이션 중 outbox lag 30분 → 알람으로 즉시 인지, 데이터는 결국 다 발행됨

**진화 — CDC로 전환 (6개월 후):**
- Outbox 폴링이 DB 부하 + 1초 lag
- Debezium CDC로 outbox 테이블 변경을 자동으로 Kafka로
- 폴링 제거, lag 50ms 미만

**교훈:**
- *원자성*은 같은 DB 트랜잭션 안에서만 보장 → 외부 발행은 별 트랙으로
- Outbox는 단순하지만 *유실 0*을 진짜로 가능하게 함
- 규모가 커지면 CDC로 진화하는 것이 자연스러운 흐름

</details>

### 🔄 꼬리질문 1: 커밋 전 발행하면 어떤 일이 생기나요?

**기대 답변:**
- 커밋 실패 시 컨슈머가 이미 처리한 상태 → 정합성 깨짐
- 같은 트랜잭션 안 다른 작업의 lock과 경합

`AFTER_COMMIT`이 기본, 단 커밋 후 발행 실패는 별도로 잡아 outbox로 보완.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

커밋 전 발행 코드 → 트랜잭션 롤백 후 *알림은 발송된* 사고. 사용자에게 "주문 생성됨" SMS만 가고 실제 주문은 없음. AFTER_COMMIT으로 즉시 교체. **교훈: 커밋 전 발행은 *데이터 정합성의 적*.**

</details>

### 🔄 꼬리질문 2: Outbox 폴링의 DB 부하는 어떻게 제어하나요?

**기대 답변:**
- 인덱스(`status, created_at`)와 적정 batch size
- 발행 후 즉시 삭제 또는 status 업데이트
- 규모가 커지면 CDC(Debezium)로 전환해 폴링 자체를 제거

<details>
<summary>📋 <b>사례</b></summary>

<br/>

Outbox 폴링 1초마다 → DB QPS 10% 추가. Debezium CDC로 전환해 폴링 제거, lag 1s → 50ms. **교훈: Outbox는 *시작*이고 CDC는 *규모의 답*.**

</details>

### 🔄 꼬리질문 3: 컨슈머 측 멱등성은 어떻게 보장하나요?

**기대 답변:**
- 이벤트 ID를 유니크 키로 두고 처리 이력 테이블에 insert
- 처리 완료 후 ack
- 멱등 키 보존 기간을 비즈니스 윈도우보다 길게

<details>
<summary>📋 <b>사례</b></summary>

<br/>

알림 컨슈머에 `processed_events(event_id PK, processed_at)` 테이블 추가, INSERT 실패면 skip. Kafka rebalance로 중복 메시지가 와도 알림 중복 0건. **교훈: 멱등성은 *공급자*보다 *소비자*가 책임지는 게 안전.**

</details>

---

## 마무리: 5편 핵심 정리

1. **SAGA**: 보상 트랜잭션과 DLQ까지 설계, Choreography vs Orchestration 판단
2. **CQRS**: 일관성 윈도우 관리, Event Sourcing은 선택적
3. **API Gateway**: 횡단 관심사만, 비즈니스 로직 금지
4. **DDD**: 컨텍스트 경계가 코드·팀·DB까지 반영
5. **도메인 이벤트 + 아웃박스**: 커밋 후 발행 + 유실 방지 + 멱등성

다음 6편은 **가용성/안정성 패턴** — Rate Limiting, Bulkhead, Circuit Breaker, Timeout Cascade, 멱등성과 재시도 jitter를 다룹니다.

```toc
```
