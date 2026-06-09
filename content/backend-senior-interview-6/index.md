---
layout: post
emoji: 🛡️
title: "시니어 백엔드 면접 질문 6편 - 가용성/안정성 패턴 (5~10년차)"
date: '2026-06-09 12:10:00'
author: 손(Son/손민기)
tags: 백엔드 면접 시니어 가용성 RateLimiting Bulkhead CircuitBreaker Timeout Idempotent 재시도 Jitter 꼬리질문
categories: CS
series: "시니어 백엔드 면접 질문"
---

6편은 **가용성/안정성 패턴**입니다. 면접관은 패턴 이름이 아니라 **임계값을 어떻게 정했고 무엇을 모니터링했는지**를 봅니다.

**시리즈 구성:**
- 1편: 인프라/스케일링
- 2편: 운영/안정성
- 3편: 설계/리더십
- 4편: 동시성/런타임
- 5편: 분산/MSA 아키텍처
- **6편 (현재)**: 가용성/안정성 패턴
- 7편 (예정): DB/일관성 운영

---

## 1. Rate Limiting

### Q1. 어떤 Rate Limiting 알고리즘을 쓰고 왜 골랐나요?

**기대 답변:**
- **Token Bucket**: 버스트 허용, 일반 API에 무난
- **Leaky Bucket**: 일정 속도 유지, 외부로 나가는 호출 보호
- **Fixed/Sliding Window**: 단순한 정량 제한, 경계 burst 문제 vs 메모리 비용

선택 기준은 버스트 허용 여부와 정밀도/메모리 트레이드오프입니다.

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 카카오톡 친구 추천 API. 사용자당 분당 60건 제한 필요. 대상 1억 키, QPS 5만.

**알고리즘 선택 — Sliding Window Counter:**
- Fixed Window는 경계 burst 문제 (59초~01초 사이에 120건 가능)
- 완전 sliding은 타임스탬프 다 저장 → 메모리 폭증
- **Sliding Window Counter** = 현재·이전 윈도우 카운트 가중 평균으로 절충

**Redis Lua 구현 (원자성 보장):**
```lua
local key = KEYS[1]
local now = tonumber(ARGV[1])  -- ms
local window = tonumber(ARGV[2])  -- 60000
local limit = tonumber(ARGV[3])  -- 60

local current_window = math.floor(now / window)
local current_key = key .. ':' .. current_window
local prev_key = key .. ':' .. (current_window - 1)

local current_count = tonumber(redis.call('GET', current_key) or '0')
local prev_count = tonumber(redis.call('GET', prev_key) or '0')

-- 현재 윈도우 진행률
local progress = (now % window) / window
local weighted = prev_count * (1 - progress) + current_count

if weighted >= limit then return 0 end

redis.call('INCR', current_key)
redis.call('EXPIRE', current_key, window * 2 / 1000)
return 1
```

**클러스터 운영:**
- 사용자 ID 기반 hashtag (`{user:12345}:counter`)로 같은 슬롯에 떨어지게
- Redis 노드 6개로 분산, P99 0.8ms

**클라이언트 응답:**
```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1700000060
Retry-After: 32
```

**결과:**
- 한도 초과 정확도 98% (Fixed Window는 80% 수준)
- 메모리: 사용자당 평균 2 키 × 약 50B = 100MB
- 악성 봇 트래픽 일평균 230만 요청 차단

**교훈:**
- 분산 환경에선 **Lua 스크립트 원자성**이 필수
- *완전 정확*보다 *충분히 정확*이 실용 (가중 평균으로 메모리 절약)
- 429 응답은 *헤더로 클라이언트 안내*가 매너

</details>

### 🔄 꼬리질문 1: 분산 환경에서 정합성은 어떻게 보장하나요?

**기대 답변:**
- Redis + **Lua 스크립트**로 read-modify-write 원자성 확보
- 키 = `userId:windowStart` 형태
- 단일 인스턴스 카운트의 race condition을 방지

Redis 클러스터에선 같은 키가 같은 슬롯에 떨어지도록 hashtag 사용.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

INCR + EXPIRE를 *2 호출로 분리*했더니 race condition으로 카운트 누락 발생 → Lua 스크립트 단일 호출로 원자화. 누락 0건. **교훈: Rate Limit의 *모든 read-modify-write*는 Lua로 묶기.**

</details>

### 🔄 꼬리질문 2: Sliding Window의 메모리 비용은 어떻게 관리하나요?

**기대 답변:**
- 정확한 sliding은 요청 타임스탬프를 모두 저장 → 메모리 폭증
- 운영에선 **Sliding Window Counter**(현재·이전 윈도우 가중 평균)로 절충
- TTL을 짧게 둬 자동 정리

<details>
<summary>📋 <b>사례</b></summary>

<br/>

완전 sliding으로 시작 → 1억 사용자 × 평균 60건 = Redis 메모리 24GB. Sliding Window Counter로 전환 후 100MB. 정확도 98% 유지. **교훈: *완전 정확*보다 *비용 대비 충분*.**

</details>

### 🔄 꼬리질문 3: 클라이언트가 한도 초과면 어떤 응답을 주나요?

**기대 답변:**
- `429 Too Many Requests` + `Retry-After` 헤더
- `X-RateLimit-*` 헤더로 잔여량 노출
- 큐 기반 비동기 백오프 권장 (지수 + jitter)

<details>
<summary>📋 <b>사례</b></summary>

<br/>

429 + Retry-After 헤더 도입 후 클라이언트 SDK가 자동 백오프 → API 폭주 패턴 70% 감소. 헤더 *없을 때*는 클라이언트가 즉시 재시도해 더 망함. **교훈: 헤더로 *클라이언트 협조*를 유도.**

</details>

---

## 2. Bulkhead 패턴

### Q2. Bulkhead로 자원을 어떻게 격리하시나요?

**기대 답변:**
**자원 사용의 한계선을 미리 그어두는** 격리 방식입니다.
- 외부 API 호출별 스레드 풀 분리
- DB 커넥션 풀을 endpoint 그룹별로 분리
- 컨테이너 CPU/메모리 limit 분리

한 곳의 폭주가 전체 가용 자원을 잡아먹지 못하게 합니다.

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 단일 백엔드가 외부 5개 시스템(결제·배송·SMS·이메일·푸시) 호출. 평소엔 잘 돌다가 SMS 게이트웨이 장애 시 *전체 API*가 다운.

**문제 진단:**
- 톰캣 스레드 풀 200개, 평소 60% 사용
- SMS 응답 지연(30s) 발생 시 195개가 SMS 대기로 묶임
- 무관한 결제 API도 5xx

**Bulkhead 도입 (Resilience4j BulkheadConfig):**

```yaml
resilience4j.bulkhead:
  instances:
    paymentClient:
      max-concurrent-calls: 80
      max-wait-duration: 100ms
    shippingClient:
      max-concurrent-calls: 40
      max-wait-duration: 50ms
    smsClient:
      max-concurrent-calls: 30       # 격리
      max-wait-duration: 0ms         # 가득 차면 즉시 거절
    emailClient:
      max-concurrent-calls: 30
      max-wait-duration: 100ms
    pushClient:
      max-concurrent-calls: 20
      max-wait-duration: 50ms
```

**임계치 산정 근거:**
- SMS 평소 동시성 p99 = 18 → 1.5배인 30으로 상한
- 가득 차면 wait 없이 즉시 `BulkheadFullException` → fallback (사용자에게 "전송 지연" 안내)

**결과 (다음 SMS 장애 시):**
- SMS 호출 30개만 묶임, 나머지 170개 스레드는 정상
- 결제·배송 등 *무관 API는 영향 0*
- "SMS 발송 지연" 안내만 일부 사용자에게 노출

**Virtual Thread 환경 (JDK 21+):**
- 스레드 풀이 사라지면서 *세마포어 기반* Bulkhead로 자연 전환
- `Semaphore(30)` 으로 동일 효과

**관측:**
- 라이브러리별 동시성 사용률 대시보드
- BulkheadFull 발생 시 Slack 알림
- 평소 사용률 80% 넘으면 임계치 재검토

**교훈:**
- Bulkhead는 *시간이 아닌 자원으로 격리*하는 패턴
- 임계치는 *평상시 p99의 1.5~2배*가 안정 (너무 크면 격리 의미 없음)
- 가득 찼을 때 **빠른 거절**이 *대기*보다 시스템 회복력에 좋음

</details>

### 🔄 꼬리질문 1: 임계치는 어떻게 산정하나요?

**기대 답변:**
- 평소 트래픽의 p99 처리에 필요한 동시성 × 1.5 ~ 2배
- 최대 throughput에서 latency가 급격히 꺾이는 지점 (knee)
- 실험적으로 부하 테스트(k6, JMeter)로 검증

<details>
<summary>📋 <b>사례</b></summary>

<br/>

평소 p99 동시성 18로 임계치 30 설정 → 평소 충분히 여유, 장애 시 *격리 효과 명확*. k6 부하 테스트로 knee point 검증. **교훈: 1.5~2배가 *너무 적지도 너무 많지도 않은* 절충점.**

</details>

### 🔄 꼬리질문 2: 풀 분리의 오버헤드는 없나요?

**기대 답변:**
- 스레드 풀 분리는 메모리·컨텍스트 스위치 비용 증가
- 트래픽이 적은 풀은 미사용 자원 낭비
- → 핵심 의존성만 분리, 나머지는 공유 풀 사용이 일반적

Virtual Thread 환경이면 스레드 풀 대신 **세마포어**로 동시성 상한.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

처음 15개 외부 호출 *전부 풀 분리* → 메모리 80% 사용. 핵심 5개만 분리, 나머지 공유로 재설계 → 메모리 40%. **교훈: Bulkhead도 *과하면 자원 낭비*, 80/20 법칙으로 선별.**

</details>

### 🔄 꼬리질문 3: 거절 전략은 어떻게 설계하나요?

**기대 답변:**
- 큐 가득 차면 즉시 거절 (`RejectedExecutionException`)
- 비즈니스에 따라 캐시된 stale 데이터로 fallback
- 클라이언트에 `503 Service Unavailable` + `Retry-After`

<details>
<summary>📋 <b>사례</b></summary>

<br/>

SMS Bulkhead 가득 시 *즉시 거절* + "발송 지연 안내" UI. 큐 대기로 30초 hang 대신 즉시 응답 → 사용자 경험·시스템 회복력 둘 다 개선. **교훈: 빠른 실패가 *느린 성공보다* 시스템 친화적.**

</details>

---

## 3. Circuit Breaker

### Q3. 서킷 브레이커 임계값과 Fallback UX는 어떻게 설계했나요?

**기대 답변:**
3축:
1. **스레드 풀 고갈 원인 파악**: 외부 API 지연이 톰캣 스레드 잠식
2. **지표 기반 임계치**: p99 2초 타임아웃 + 에러율 30% 초과 시 Open
3. **비즈니스 맥락 Fallback**: 무한 로딩 대신 "연동 지연 안내" 같은 명확한 응답

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 추천 시스템 외부 호출 — 평소 응답 80ms, 가끔 ML 모델 갱신 시 5초로 튐. 그동안 상품 페이지 응답이 같이 느려져 이탈률 +3%.

**서킷 브레이커 설정 (Resilience4j):**
```yaml
resilience4j.circuitbreaker:
  instances:
    recommendation:
      sliding-window-type: COUNT_BASED
      sliding-window-size: 100
      minimum-number-of-calls: 20
      failure-rate-threshold: 50         # 에러율 50%
      slow-call-rate-threshold: 50       # 슬로우 비율 50%
      slow-call-duration-threshold: 1s   # 1초 이상은 슬로우
      wait-duration-in-open-state: 30s
      permitted-number-of-calls-in-half-open-state: 5
```

**Fallback 설계 (비즈니스 맥락):**
```kotlin
@CircuitBreaker(name = "recommendation", fallbackMethod = "fallback")
fun getRecommendations(userId: Long): List<Product> {
  return recommendationClient.get(userId)
}

fun fallback(userId: Long, e: Throwable): List<Product> {
  // 1순위: Redis에 캐시된 이전 추천 결과 (TTL 1h)
  redisCache.get("reco:$userId")?.let { return it }
  
  // 2순위: 카테고리 인기 상품 (사용자 컨텍스트와 무관, 매일 갱신)
  return popularProductsBy(userCategoryOf(userId))
}
```

**실제 ML 모델 갱신 시 동작:**

| 시점 | 상태 | 동작 |
|---|---|---|
| T+0s | Closed | 정상 호출, p99 80ms |
| T+30s | Closed | 모델 갱신 시작, 응답 5s |
| T+45s | Open ⚡ | 슬로우 비율 60% 도달, 회로 차단 |
| T+45s ~ 75s | Open | 모든 요청 즉시 fallback (캐시 + 인기상품) |
| T+75s | Half-Open | 5개 테스트 호출, 4개 성공 |
| T+76s | Closed | 정상 복귀 |

**결과:**
- 추천 외부 지연 시 *상품 페이지 응답은 100ms 유지*
- 추천 품질 일부 저하 (캐시·인기상품 fallback), 이탈률 영향 0.3%로 감소
- 사용자 화면에 *Fallback 표시 없음* (정상 추천처럼 보임)

**Half-Open 복구 기준:**
- 5개 테스트 호출 중 3개 이상 성공 + p99 < 1s
- 실패하면 다시 Open + wait 60s (지수 증가)

**교훈:**
- 서킷 브레이커는 *에러*뿐 아니라 *슬로우 콜*도 트리거해야 의미 있음
- Fallback은 *기능 비활성화*가 아니라 *그럴듯한 대체*가 사용자 만족도에 결정적
- 추천처럼 *없어도 되는 기능*은 서킷 우선 적용 대상

</details>

### 🔄 꼬리질문 1: Half-open에서 복구 기준은?

**기대 답변:**
- 일정 시간(예: 30초) 후 소수 요청만 통과시켜 시험
- 성공률 N% 넘으면 Closed로 복귀
- 실패하면 다시 Open + 대기 시간 지수 증가

<details>
<summary>📋 <b>사례</b></summary>

<br/>

Half-Open에서 5건 테스트, 3건 이상 성공 + p99 < 1s를 복구 기준화. 실패 시 wait 60s·120s·240s 지수 증가. ML 모델 *부분 복구* 상황에서 *너무 빨리 Closed* 방지. **교훈: 복구 판단은 *건수 + 지연*을 같이 봐야 안전.**

</details>

### 🔄 꼬리질문 2: Fallback의 데이터 품질은 어떻게 다루나요?

**기대 답변:**
- 캐시된 stale 데이터에 **시점 표시** ("3분 전 기준")
- 빈 응답 vs stale, 도메인에 따라 결정 (결제는 빈 응답, 추천은 stale)
- 사용자 경험에서 *오답*과 *지연*의 비용 비교

<details>
<summary>📋 <b>사례</b></summary>

<br/>

추천: stale OK (이전 추천 + 인기상품 fallback), 결제 잔액: stale 금지 (정확한 값 또는 에러). 도메인별 다른 정책. **교훈: Fallback은 *기술 결정*이 아니라 *비즈니스 결정*.**

</details>

### 🔄 꼬리질문 3: 서킷 브레이커와 재시도를 같이 쓸 때 주의점은?

**기대 답변:**
- 서킷이 Open이면 재시도하지 않음 (즉시 Fallback)
- 재시도 → 서킷 카운트 영향 분리 (재시도 누적이 서킷을 잘못 열게 함)
- 재시도는 idempotent 호출에만

<details>
<summary>📋 <b>사례</b></summary>

<br/>

재시도가 서킷 실패 카운트에 가산되어 *정상보다 빠르게 Open*되는 사고 → 재시도 메트릭과 서킷 메트릭 분리. **교훈: 재시도 = 분산, 서킷 = 차단, *역할 분리* 필수.**

</details>

---

## 4. Timeout Cascade

### Q4. 호출 체인 전체에서 타임아웃을 어떻게 분배하나요?

**기대 답변:**
- 상위 SLO에서 시작해 **하위로 갈수록 줄여** 분배 (deadline propagation)
- 네트워크·재시도 여유까지 빼고 남은 시간으로 하위 호출
- gRPC `Deadline`, OpenTelemetry baggage 활용

일률적 타임아웃은 cascade를 막지 못합니다.

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 주문 API SLO 4초. 내부적으로 5개 서비스 호출 체인. 모든 호출에 일률적 5초 timeout 설정.

**문제 — Cascade 발생:**
```
Order API (SLO 4s, timeout 5s)
  → Inventory (5s timeout)
    → Pricing (5s timeout)
      → External Vendor (5s timeout) ← 여기서 3s 지연
    → Pricing returns at 3s
  → Inventory returns at 3.5s
→ Order API responds at 4.2s ⚡ SLO 위반
```

- 또는 Inventory가 4초에 응답 → Order는 이미 클라이언트 timeout이 끊긴 후 응답 → 자원 낭비
- 또는 클라이언트 cancel을 백엔드까지 전파 안 함 → 좀비 작업 누적

**Deadline Propagation 도입:**

**gRPC 환경 (자동):**
- Order API에서 `withDeadlineAfter(4, SECONDS)` 설정
- 모든 하위 호출에 *남은 시간*이 자동 전파
- 각 서비스에서 `Context.current().getDeadline()`으로 확인

**HTTP 환경 (커스텀):**
```kotlin
// Order API
val deadline = System.currentTimeMillis() + 4000
headers.add("X-Deadline-Ms", deadline.toString())

// Inventory 인터셉터
val remaining = headers["X-Deadline-Ms"].toLong() - System.currentTimeMillis() - 100  // 네트워크 여유
if (remaining < 200) throw DeadlineExceededException()

// Pricing 호출 시
webClient.get()
  .retrieve()
  .toEntity(Price::class.java)
  .timeout(Duration.ofMillis(remaining - 200))  // 추가 호출 여유 빼고
```

**결과:**
- 외부 vendor 지연 시 즉시 cascade 차단 (deadline 초과 즉시 throw)
- 좀비 작업 0건 (이전엔 일 평균 1만 건)
- SLO 위반: 일 평균 200건 → 30건 (남은 30건은 진짜 백엔드 느림)

**부가 효과 — Client Cancel 전파:**
- HTTP/2 RST_STREAM이 자동 전파
- WebFlux Publisher cancel이 DB query까지 전파 (`Statement.cancel()`)
- 클라이언트가 끊으면 모든 백엔드도 작업 중단

**교훈:**
- *일률 timeout*은 "cascade 막는다"는 환상만 줌
- **남은 deadline 기반 동적 timeout**이 실제로 cascade를 끊음
- gRPC는 표준으로 제공, HTTP는 직접 구현해도 가치 큼

</details>

### 🔄 꼬리질문 1: 일률적 5초 타임아웃의 문제는?

**기대 답변:**
- 상위가 4초에 응답해야 하는데 하위 5초 대기 → 무의미한 대기
- 하위가 이미 죽었는데 상위가 재시도 → 회복 자체를 막음
- 클라이언트가 끊겨도 서버는 계속 작업 → 자원 낭비

<details>
<summary>📋 <b>사례</b></summary>

<br/>

일률 5s timeout → 상위가 *이미 4s에 timeout 했는데* 하위는 5s까지 작업 계속. 좀비 작업 일 1만 건. Deadline 전파로 0건. **교훈: 일률 timeout은 *자원 낭비의 주범*.**

</details>

### 🔄 꼬리질문 2: deadline propagation을 어떻게 구현하나요?

**기대 답변:**
- gRPC: 메타데이터 `grpc-timeout` 자동 전파
- HTTP: 커스텀 헤더(예: `X-Deadline-Ms`) + 인터셉터에서 남은 시간 계산
- 컨텍스트(Spring `WebClient`의 `responseTimeout`)에 남은 deadline 반영

<details>
<summary>📋 <b>사례</b></summary>

<br/>

HTTP 환경에서 `X-Deadline-Ms` 헤더 + Servlet Filter로 남은 시간 계산. 모든 외부 호출에 자동 적용. gRPC 전환 없이도 cascade 차단. **교훈: HTTP에서도 *deadline 전파는 직접 구현 가능*.**

</details>

### 🔄 꼬리질문 3: 클라이언트 cancel을 백엔드까지 어떻게 전파하나요?

**기대 답변:**
- HTTP/2 RST_STREAM, gRPC client cancel은 자동 전파
- Servlet은 `AsyncContext` + 클라이언트 disconnect 감지
- Reactive(WebFlux)는 Publisher cancel 자동 전파
- 백엔드에서 DB 쿼리도 cancel(`pg_cancel_backend`)까지 연결

<details>
<summary>📋 <b>사례</b></summary>

<br/>

WebFlux + R2DBC 환경에서 클라이언트 cancel이 *DB 쿼리까지 자동 전파* — 30초 분석 쿼리도 즉시 중단. PG 부하 30% 감소. **교훈: cancel 전파는 *말단까지 연결*되어야 효과.**

</details>

---

## 5. 멱등성과 재시도 Jitter

### Q5. 외부 API 재시도에서 단순 지수 백오프만 적용하면 어떤 문제가 생기나요?

**기대 답변:**
복구 시점에 멈춰있던 요청이 **동시에 재시도하며 의존성 서버를 다시 죽이는** thundering herd가 발생합니다.

3축:
1. **지수 백오프**로 점진적 부하 감소
2. **Jitter(난수)** 부여로 재시도 시점 분산
3. **Full Jitter** 채택으로 복구 피크 완화

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 결제 API가 외부 PG사 호출. PG사 5분 점검 후 복구 직후 *다시 다운*. 같은 패턴이 3번 반복.

**원인 — Thundering Herd:**
- 5분간 멈춰있던 클라이언트 요청 50만 건이 모두 단순 지수 백오프 중
- 1차 대기 1s, 2차 2s, 3차 4s, 4차 8s, 5차 16s
- PG사 복구 시점 ± 1초 이내에 *수만 건이 동시 재시도* → PG사 또 다운

**기존 코드 (Equal Backoff):**
```kotlin
@Retryable(value=[Exception::class], maxAttempts=5,
  backoff=Backoff(delay=1000, multiplier=2.0))
fun callPg(req: PaymentRequest) { ... }
```
- `random` 옵션 없음 → 모든 클라이언트가 같은 시점에 재시도

**개선 — Full Jitter:**
```kotlin
class FullJitterRetry {
  fun callWithRetry(maxAttempts: Int = 5, baseDelayMs: Long = 1000) {
    var attempt = 0
    while (attempt < maxAttempts) {
      try { return callPg(req) }
      catch (e: RetryableException) {
        attempt++
        if (attempt >= maxAttempts) throw e
        val cap = baseDelayMs * (1L shl attempt)  // 지수 증가
        val sleep = Random.nextLong(0, cap)        // 0 ~ cap 사이 랜덤
        Thread.sleep(sleep)
      }
    }
  }
}
```

**비교 — 50만 클라이언트 시뮬레이션:**

| 전략 | 복구 직후 1초간 재시도 수 |
|---|---|
| 고정 백오프 | 38만 건 (76%) — 폭주 |
| Equal Jitter | 19만 건 (38%) — 여전히 위험 |
| **Full Jitter** | **6.2만 건 (12%)** — 평탄 분포 |
| Decorrelated Jitter | 5.8만 건 (11.6%) — 최적, 구현 복잡 |

**적용 후:**
- PG사 복구 후 *다시 죽는 패턴 사라짐*
- 평균 재시도 후 성공률: 23% → 71%
- 운영팀의 새벽 호출 감소

**서킷 브레이커와의 조합:**
```kotlin
@CircuitBreaker(name = "pg")
@Retry(name = "pgRetry")  // Full Jitter 설정된 retry
fun callPg(req: PaymentRequest): PaymentResult {
  return pgClient.charge(req)
}
```
- 서킷 Open이면 retry 자체 차단 → 즉시 Fallback
- 서킷 Closed/Half-Open에서만 jitter retry 동작

**교훈:**
- *지수 백오프만으로는 thundering herd를 못 막음*
- **Full Jitter**가 거의 항상 정답 (AWS Architecture Blog 권장)
- 서킷 브레이커와 *역할 분리* 필요 (서킷 = 차단, retry = 분산)

</details>

### 🔄 꼬리질문 1: Full Jitter vs Equal Jitter는 어떻게 다른가요?

**기대 답변:**
- **Full Jitter**: `sleep = random(0, base * 2^attempt)` — 가장 평탄
- **Equal Jitter**: `sleep = base * 2^attempt / 2 + random(0, base * 2^attempt / 2)`
- **Decorrelated Jitter**: 이전 sleep에 비례 — AWS SDK 표준

대부분의 케이스에서 **Full Jitter**가 thundering herd를 가장 잘 막습니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

Equal Jitter로 시작 → 복구 직후 1초간 38% 재시도, 여전히 PG사 다운. Full Jitter로 전환 후 12%까지 평탄화. **교훈: Full Jitter는 *그냥 기본값으로* 채택해도 무방.**

</details>

### 🔄 꼬리질문 2: 멱등성이 보장 안 된 호출도 재시도하나요?

**기대 답변:**
하지 않습니다.
- 재시도 가능: GET, 멱등키가 있는 POST/PUT/DELETE
- 재시도 금지: 멱등키 없는 결제/주문 생성

서버가 멱등키를 받아 처리 이력을 저장하면 클라이언트는 안심하고 재시도 가능합니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

PG 결제 호출에 `Idempotency-Key` 헤더 도입 (Stripe 패턴). 같은 키 재요청은 서버가 기존 응답 반환. 중복 결제 사고 0건. **교훈: 멱등키는 *클라이언트 재시도 안전망*.**

</details>

### 🔄 꼬리질문 3: 서킷 브레이커와 재시도 jitter를 어떻게 조합하나요?

**기대 답변:**
- 서킷 Open이면 재시도 자체 차단 (즉시 Fallback)
- 서킷 Closed/Half-open일 때만 재시도 (지수 백오프 + Full Jitter)
- 재시도 횟수는 서킷 카운트에서 분리해 별도 메트릭으로 관측

<details>
<summary>📋 <b>사례</b></summary>

<br/>

`@CircuitBreaker` + `@Retry`(Full Jitter) 조합. 서킷 Open은 즉시 Fallback, Closed/Half-Open만 jitter retry. 재시도 카운트와 서킷 카운트 Micrometer로 분리. **교훈: 두 도구는 *역할이 다름*, 같이 쓰되 메트릭은 분리.**

</details>

---

## 마무리: 6편 핵심 정리

1. **Rate Limiting**: 알고리즘별 트레이드오프 + Redis Lua 원자성
2. **Bulkhead**: 자원 격리 단위와 임계치 산정 + 거절 전략
3. **Circuit Breaker**: 임계치·Half-open·Fallback 품질
4. **Timeout Cascade**: deadline propagation으로 cascade 차단
5. **재시도 Jitter**: Full Jitter + 멱등성 + 서킷과의 조합

다음 7편은 **DB/일관성 운영** — Index Cardinality, Read Committed vs RR, Write Amplification, RLS, 쿼리 플랜 flip을 다룹니다.

```toc
```
