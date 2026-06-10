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
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** Rate Limit을 `GET count → 검사 → INCR` *두 번의 Redis 호출*로 구현. 평소엔 정확했는데, 같은 사용자가 *동시에 여러 요청*을 보내면 *둘 다 GET에서 같은 값을 읽고 둘 다 통과*시켜 한도를 초과하는 race condition 발생 (봇이 이를 악용).

**진단:**
- `GET`과 `INCR` 사이에 *다른 요청이 끼어드는* 시간 윈도우 존재
- 분산 환경(여러 API 인스턴스)에선 이 윈도우가 더 빈번
- 결과적으로 분당 60건 제한이 *동시 요청 시 80~100건까지* 새어나감

**조치 — Lua 스크립트로 원자화:**
- `GET → 검사 → INCR → EXPIRE`를 **단일 Lua 스크립트**로 묶음 → Redis가 *원자적으로 실행* (중간 끼어듦 불가)
- Redis Cluster에선 *같은 사용자 키가 같은 슬롯*에 떨어지도록 hashtag(`{user:123}:...`) 적용

**결과:**
- 동시 요청에도 한도 정확히 적용 (새어나감 0)
- 봇의 race condition 악용 차단

**교훈:** Rate Limit의 모든 *read-modify-write*는 **Lua 스크립트로 원자화**해야 한다. `GET → INCR` 분리는 동시 요청 시 *반드시 새어나간다*. Redis Cluster에선 *hashtag로 같은 슬롯 보장*까지 해야 Lua가 동작한다.

</details>

### 🔄 꼬리질문 2: Sliding Window의 메모리 비용은 어떻게 관리하나요?

**기대 답변:**
- 정확한 sliding은 요청 타임스탬프를 모두 저장 → 메모리 폭증
- 운영에선 **Sliding Window Counter**(현재·이전 윈도우 가중 평균)로 절충
- TTL을 짧게 둬 자동 정리

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 정확한 Sliding Window Log(각 요청 타임스탬프를 Redis Sorted Set에 저장)로 구현. 정확도는 100%였으나, *1억 사용자 × 평균 60건 타임스탬프*가 Redis 메모리 **24GB**를 잡아먹어 비용 폭발 + Redis 메모리 압박으로 eviction 위험.

**진단:**
- 완전 정확한 sliding은 *모든 요청 타임스탬프를 보관*해야 함 → 메모리가 요청 수에 비례
- 실제로 *분 단위 한도 검사*에 *밀리초 정확도*는 과잉

**조치 — Sliding Window Counter로 절충:**
- 타임스탬프 로그 대신 *현재 윈도우 카운트 + 이전 윈도우 카운트* 두 정수만 저장
- 가중 평균(`prev * (1-progress) + current`)으로 근사 → 메모리 사용자당 2개 정수
- TTL을 윈도우 2배로 짧게 둬 자동 정리

**결과:**
- 메모리: 24GB → 100MB (240배 절감)
- 정확도 98% (분 단위 한도엔 충분)

**교훈:** *완전 정확한 Sliding Window Log*는 메모리가 요청 수에 비례해 폭발한다. **Sliding Window Counter(두 윈도우 가중 평균)** 로 *98% 정확도에 메모리 240배 절감*. "완전 정확"보다 *"비용 대비 충분히 정확"* 이 실용적이다.

</details>

### 🔄 꼬리질문 3: 클라이언트가 한도 초과면 어떤 응답을 주나요?

**기대 답변:**
- `429 Too Many Requests` + `Retry-After` 헤더
- `X-RateLimit-*` 헤더로 잔여량 노출
- 큐 기반 비동기 백오프 권장 (지수 + jitter)

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 한도 초과 시 *단순히 429만* 반환했더니, 클라이언트(모바일 앱·파트너 서버)들이 *언제 다시 시도할지 몰라 즉시 재시도*를 반복 → 차단된 요청이 *더 많은 트래픽*을 유발하는 악순환.

**진단:**
- 429만으로는 클라이언트가 *얼마나 기다려야 하는지* 알 수 없음
- 결과적으로 *차단당한 클라이언트가 더 공격적으로 재시도* → 서버 부하 가중

**조치 — 협조를 유도하는 응답:**
- `429` + **`Retry-After: 32`** (정확한 대기 시간) + `X-RateLimit-Remaining/Reset` 헤더
- 파트너 SDK에 *Retry-After 기반 자동 백오프*(지수 + jitter) 가이드 배포
- 문서에 "429 받으면 Retry-After만큼 대기" 명시

**결과:**
- 차단 후 *무분별 재시도 70% 감소* (클라이언트가 헤더 보고 대기)
- 차단이 *더 큰 부하를 유발하던 악순환* 해소

**교훈:** Rate Limit 응답은 *차단으로 끝이 아니라 클라이언트 협조를 유도*해야 한다. **`Retry-After` + `X-RateLimit-*` 헤더**로 "언제 다시 오라"를 알려주면 *무분별 재시도가 줄어* 서버를 보호한다. 헤더 없는 429는 오히려 부하를 키운다.

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
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** Bulkhead 임계치를 *감으로* SMS 클라이언트에 100으로 설정. 막상 SMS 장애가 나니 100개 스레드가 다 묶여 *격리 효과가 거의 없었음* (전체 200개 중 100개가 한 의존성에).

**진단:**
- 임계치가 *평소 사용량보다 과도하게 큼* → 격리 경계가 사실상 무의미
- 적정값을 *측정 없이 감으로* 잡은 게 원인

**조치 — 측정 기반 산정:**
- APM에서 SMS 호출의 *평소 동시성 p99 = 18* 확인
- 임계치 = p99 × 1.5 ≈ **30** 으로 설정 (평소엔 충분히 여유, 장애 시 30개만 묶임)
- k6 부하 테스트로 *throughput이 꺾이는 knee point*도 교차 검증

**결과:**
- 다음 SMS 장애 시 *30개만 묶이고 170개는 정상* → 격리 명확
- 평소 트래픽엔 영향 0 (30 > 평소 p99 18)

**교훈:** Bulkhead 임계치는 *감이 아니라 측정*이다. **평소 동시성 p99 × 1.5~2배**가 안정점 — 너무 크면 격리가 무의미하고, 너무 작으면 평소 트래픽을 막는다. k6로 *knee point*를 교차 검증한다.

</details>

### 🔄 꼬리질문 2: 풀 분리의 오버헤드는 없나요?

**기대 답변:**
- 스레드 풀 분리는 메모리·컨텍스트 스위치 비용 증가
- 트래픽이 적은 풀은 미사용 자원 낭비
- → 핵심 의존성만 분리, 나머지는 공유 풀 사용이 일반적

Virtual Thread 환경이면 스레드 풀 대신 **세마포어**로 동시성 상한.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** "격리는 좋은 것"이라며 *외부 호출 15개 전부를 별도 스레드 풀로 분리*. 그 결과 *스레드 풀 15개 × 각 수십 개 스레드* = 메모리 사용률 80%, 대부분 풀은 *거의 안 쓰여* 자원만 낭비.

**진단:**
- 스레드 풀마다 *최소 스레드·메모리·컨텍스트 스위치 비용*
- 트래픽이 거의 없는 의존성(예: 월 1회 호출하는 관리용 API)까지 전용 풀 → 낭비
- 격리의 *이득보다 오버헤드*가 큰 의존성이 다수

**조치 — 80/20 선별 격리:**
- *장애 시 영향이 크고 호출량이 많은 핵심 5개*만 전용 풀(또는 세마포어) 격리
- 나머지 10개는 *공유 풀* 사용 (격리 안 함)
- Virtual Thread 도입 후엔 스레드 풀 대신 *세마포어*로 동시성 상한 (메모리 부담 거의 0)

**결과:**
- 메모리 사용률 80% → 40%
- 핵심 의존성 격리 효과는 그대로 유지

**교훈:** Bulkhead도 *과하면 자원 낭비*다. 스레드 풀 분리는 *메모리·컨텍스트 스위치 비용*이 든다. **장애 영향 크고 호출 많은 핵심만 선별 격리**(80/20)하고, 나머지는 공유 풀. Virtual Thread 환경이면 *세마포어*가 오버헤드 거의 없이 같은 격리를 준다.

</details>

### 🔄 꼬리질문 3: 거절 전략은 어떻게 설계하나요?

**기대 답변:**
- 큐 가득 차면 즉시 거절 (`RejectedExecutionException`)
- 비즈니스에 따라 캐시된 stale 데이터로 fallback
- 클라이언트에 `503 Service Unavailable` + `Retry-After`

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** SMS Bulkhead가 가득 찼을 때 *대기 큐(max-wait 5초)*를 뒀더니, SMS 장애 시 *모든 요청이 5초씩 대기*하다 결국 실패 → 사용자가 *5초 hang 후 에러*를 보고 더 나쁜 경험.

**진단:**
- "조금 기다리면 자리가 날 것"이라는 가정으로 대기 큐를 뒀으나
- *장애는 일시적 폭주가 아니라 지속*이라 대기해도 자리가 안 남 → 5초 낭비 후 실패
- 대기하는 동안 *스레드·자원이 묶여* 회복도 느려짐

**조치 — 빠른 거절(fail-fast):**
- `max-wait-duration: 0ms` → 가득 차면 *즉시 `BulkheadFullException`*
- 즉시 fallback: 사용자에게 *"SMS 발송 지연, 잠시 후 재시도" 안내* (hang 없이 바로)
- SMS는 큐로 보내 *비동기 재전송* (사용자는 안 기다림)

**결과:**
- 5초 hang → 즉시 응답 (사용자 경험 개선)
- 대기로 묶이던 자원이 풀려 *시스템 회복도 빨라짐*

**교훈:** 자원이 가득 찼을 때 **빠른 거절(fail-fast)이 대기보다 낫다**. 장애는 *일시 폭주가 아니라 지속*인 경우가 많아 대기는 *자원만 묶고 결국 실패*한다. 즉시 거절 + fallback(안내·비동기 큐)이 *사용자 경험과 시스템 회복력*을 동시에 지킨다.

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
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 서킷이 Open 후 30초 뒤 Half-Open으로 가서 *테스트 1건 성공하자마자 Closed*로 복귀했는데, 외부 서비스는 *부분 복구* 상태였음 → 다시 트래픽이 몰리자 즉시 재장애 → Open ↔ Closed가 *수 초 간격으로 진동*(flapping).

**진단:**
- 복구 판단을 *단 1건 성공*으로 한 게 성급
- 외부가 *완전 복구가 아니라 부분 복구*였는데 1건만 보고 전체 트래픽을 흘려보냄
- Open/Closed 진동으로 사용자 경험이 더 불안정

**조치 — 보수적 복구 기준:**
- Half-Open에서 *5건 테스트* → **3건 이상 성공 + p99 < 1s** 둘 다 만족해야 Closed
- 실패 시 *wait 시간을 지수 증가*(30s → 60s → 120s)해 flapping 방지

**결과:**
- 부분 복구 상태에서 *성급한 Closed* 방지
- Open/Closed 진동 소멸, 안정적 복구

**교훈:** Half-Open 복구는 *단 1건 성공*으로 판단하면 **부분 복구 상태에서 성급히 열려 재장애·flapping**이 난다. **건수(3/5 이상) + 지연(p99)** 을 함께 보고, 실패 시 *wait를 지수 증가*시켜 진동을 막는다.

</details>

### 🔄 꼬리질문 2: Fallback의 데이터 품질은 어떻게 다루나요?

**기대 답변:**
- 캐시된 stale 데이터에 **시점 표시** ("3분 전 기준")
- 빈 응답 vs stale, 도메인에 따라 결정 (결제는 빈 응답, 추천은 stale)
- 사용자 경험에서 *오답*과 *지연*의 비용 비교

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 외부 환율 API 장애 시, 추천 도메인 감각으로 *결제 화면에 캐시된 옛 환율(stale)* 을 fallback으로 보여줬더니, 사용자가 *옛 환율로 결제 금액을 오인*해 클레임 + 회계 정합성 문제.

**진단:**
- "stale이라도 보여주는 게 낫다"는 추천 도메인 원칙을 *결제에 잘못 적용*
- 추천은 *틀려도 무해*하지만, 결제 금액은 *틀리면 직접 손해*
- 도메인마다 *"오답 비용 vs 지연 비용"* 이 정반대

**조치 — 도메인별 Fallback 정책 분리:**
- **추천·콘텐츠**: stale 허용 (이전 데이터 + "방금 전 기준" 표시)
- **결제·환율·잔액**: stale 금지 → *정확한 값 또는 명시적 에러*("환율 조회 실패, 잠시 후 재시도")
- 정책을 도메인 코드에 *명문화*

**결과:**
- 결제 금액 오인 클레임 0건
- 추천은 여전히 stale fallback으로 매끄러운 UX 유지

**교훈:** Fallback 데이터 품질은 *기술이 아니라 비즈니스 결정*이다. **추천처럼 오답이 무해한 곳은 stale 허용, 결제처럼 오답이 직접 손해인 곳은 빈 응답/명시적 에러**. "stale이 항상 낫다"는 도메인을 무시한 위험한 일반화다. 핵심은 *"오답 비용 vs 지연 비용"* 비교.

</details>

### 🔄 꼬리질문 3: 서킷 브레이커와 재시도를 같이 쓸 때 주의점은?

**기대 답변:**
- 서킷이 Open이면 재시도하지 않음 (즉시 Fallback)
- 재시도 → 서킷 카운트 영향 분리 (재시도 누적이 서킷을 잘못 열게 함)
- 재시도는 idempotent 호출에만

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 외부 호출에 *재시도 3회 + 서킷 브레이커*를 같이 적용했는데, 서킷이 *정상보다 훨씬 빨리 Open*되어 멀쩡한 의존성을 자꾸 차단. 또 서킷이 Open인데도 *재시도가 계속 호출*을 시도.

**진단:**
- **재시도 실패가 서킷 실패 카운트에 가산** → 1번 호출이 (재시도 포함) 3번 실패로 집계 → 서킷이 3배 빨리 열림
- 데코레이터 순서가 잘못돼 *서킷 Open 상태에서도 재시도*가 호출을 시도 (즉시 fallback 안 됨)

**조치 — 역할 분리 + 순서 정렬:**
- 데코레이터 순서: **CircuitBreaker가 바깥, Retry가 안쪽** (서킷 Open이면 재시도 자체를 차단)
- 서킷 카운트는 *최종 결과(재시도 다 소진 후)* 만 반영하도록 분리
- 재시도·서킷 메트릭을 *Micrometer로 각각* 노출해 구분

**결과:**
- 서킷이 정상 임계에서 열림 (재시도로 인한 조기 Open 소멸)
- 서킷 Open 시 재시도 없이 즉시 fallback

**교훈:** 서킷 브레이커와 재시도는 **역할이 다르다 — 서킷=차단, 재시도=분산**. 둘을 같이 쓸 때 *(1) 데코레이터 순서(서킷 바깥/재시도 안쪽), (2) 재시도 실패가 서킷 카운트를 오염시키지 않게 분리* 해야 한다. 안 그러면 *재시도가 서킷을 조기에 열고*, *Open 상태에서도 재시도*하는 모순이 생긴다.

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
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 모든 서비스에 *일률 5초 timeout*. 외부 vendor가 지연되자, 상위 주문 API는 *이미 4초(클라이언트 SLO)에 끊겼는데도* 하위 체인은 *5초까지 계속 작업*. 끊긴 요청의 작업이 *좀비*로 누적되어 일 평균 1만 건의 헛작업이 자원을 잡아먹음.

**진단:**
- 클라이언트는 4초에 타임아웃 → 응답을 안 받음
- 그런데 백엔드는 *그 사실을 모르고* 5초까지 DB·외부 호출 계속 수행
- "아무도 안 받을 응답"을 만드느라 자원 낭비 (좀비 작업)

**조치 — Deadline Propagation:**
- 상위에서 *남은 deadline*을 헤더(`X-Deadline-Ms`)로 전파
- 각 하위 서비스가 *남은 시간이 200ms 미만이면 즉시 중단*(이미 늦었으니 헛작업 안 함)
- 클라이언트 cancel도 백엔드까지 전파 (HTTP/2 RST_STREAM)

**결과:**
- 좀비 작업 일 1만 건 → 0건
- 끊긴 요청의 자원이 즉시 회수되어 *전체 처리량 개선*

**교훈:** 일률 timeout은 *"이미 늦은 작업을 계속하는"* 자원 낭비를 만든다. 상위가 끊겼는데 하위가 모르고 작업하면 *좀비*가 쌓인다. **남은 deadline을 전파**해 *이미 늦었으면 즉시 중단*하게 해야 자원이 회수된다.

</details>

### 🔄 꼬리질문 2: deadline propagation을 어떻게 구현하나요?

**기대 답변:**
- gRPC: 메타데이터 `grpc-timeout` 자동 전파
- HTTP: 커스텀 헤더(예: `X-Deadline-Ms`) + 인터셉터에서 남은 시간 계산
- 컨텍스트(Spring `WebClient`의 `responseTimeout`)에 남은 deadline 반영

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** "deadline propagation은 gRPC에서만 되는 것"이라 생각해, HTTP 기반 레거시 서비스 체인은 *일률 timeout*을 못 벗어나고 있었음. gRPC 전면 전환은 비용이 커서 보류.

**조치 — HTTP에서 직접 구현:**
- 진입점에서 `X-Deadline-Ms = now + SLO` 헤더 생성
- **공통 Servlet Filter / WebClient 인터셉터**:
  - 들어온 요청의 `X-Deadline-Ms` 읽기
  - *남은 시간 = deadline - now - 네트워크 마진(100ms)* 계산
  - 남은 시간이 임계 미만이면 *즉시 504* (헛작업 차단)
  - 하위 호출 timeout을 *남은 시간*으로 동적 설정 + 헤더 전파
- 모든 서비스에 *공통 라이브러리*로 배포 (서비스별 코드 변경 최소화)

**결과:**
- gRPC 전환 없이 *HTTP 체인 전체에 deadline propagation* 적용
- cascade·좀비 작업 차단 (gRPC와 동등 효과)

**교훈:** deadline propagation은 *gRPC 전유물이 아니다*. **HTTP에서도 커스텀 헤더(`X-Deadline-Ms`) + 공통 Filter/인터셉터**로 충분히 구현 가능하다. gRPC는 표준으로 제공할 뿐, *공통 라이브러리 하나*면 레거시 HTTP 체인도 cascade를 끊을 수 있다.

</details>

### 🔄 꼬리질문 3: 클라이언트 cancel을 백엔드까지 어떻게 전파하나요?

**기대 답변:**
- HTTP/2 RST_STREAM, gRPC client cancel은 자동 전파
- Servlet은 `AsyncContext` + 클라이언트 disconnect 감지
- Reactive(WebFlux)는 Publisher cancel 자동 전파
- 백엔드에서 DB 쿼리도 cancel(`pg_cancel_backend`)까지 연결

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 대시보드의 *무거운 분석 쿼리*(30초 소요)를 사용자가 *기다리다 페이지를 닫아도*, 백엔드는 *그 쿼리를 끝까지 수행*. 사용자들이 "느리다고 새로고침 연타"하면 *끝낼 수 없는 쿼리가 PG에 누적*되어 DB가 마비.

**진단:**
- 클라이언트가 *연결을 끊어도(cancel)* 백엔드·DB는 그 사실을 모르고 작업 계속
- 새로고침 연타 = *버려질 30초 쿼리가 계속 쌓임* → PG 커넥션·CPU 고갈

**조치 — Cancel 말단까지 전파 (WebFlux + R2DBC):**
- WebFlux로 전환 → 클라이언트 연결 끊김이 *Publisher cancel*로 전파
- R2DBC는 *cancel 시 진행 중 DB 쿼리도 중단* (`Statement.cancel`까지 연결)
- 즉, 사용자가 페이지 닫으면 *DB 쿼리까지 즉시 중단*

**결과:**
- 버려질 분석 쿼리가 *즉시 취소*되어 PG 부하 30% 감소
- 새로고침 연타로 인한 DB 마비 소멸

**교훈:** 클라이언트 cancel은 *말단(DB 쿼리)까지 전파*되어야 효과가 있다. **HTTP/2 RST_STREAM·WebFlux Publisher cancel·R2DBC가 연결**되면, 사용자가 끊은 순간 *DB 쿼리까지 즉시 취소*된다. Cancel이 *중간에 끊기면* 백엔드는 여전히 버려질 작업을 수행한다.

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
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** Thundering herd를 막으려 *Equal Jitter*(고정분 + 랜덤분)를 도입. 효과는 있었지만 PG사 복구 직후 *여전히 1초간 38%가 몰려* 또 한 번 휘청. "jitter를 줬는데 왜 아직도?"

**진단 — 시뮬레이션으로 분포 비교:**
- Equal Jitter는 `base*2^n / 2 + random(0, base*2^n / 2)` → *고정분(절반)이 있어* 재시도가 *특정 구간에 여전히 뭉침*
- Full Jitter는 `random(0, base*2^n)` → *0부터 cap까지 완전 균등* → 가장 평탄

| 전략 | 복구 직후 1초 재시도 |
|---|---|
| Equal Jitter | 38% (뭉침 잔존) |
| Full Jitter | 12% (평탄) |

**조치:**
- Equal → **Full Jitter**로 변경 (`Random.nextLong(0, cap)`)

**결과:**
- 복구 직후 재시도가 *12%로 평탄화* → PG사 재장애 소멸
- 재시도 후 성공률 향상

**교훈:** Jitter도 종류가 다르다. **Equal Jitter는 고정분 때문에 여전히 뭉치고, Full Jitter(0~cap 완전 균등)가 가장 평탄**하다. AWS Architecture Blog 권장대로 *특별한 이유 없으면 Full Jitter를 기본값*으로 쓴다.

</details>

### 🔄 꼬리질문 2: 멱등성이 보장 안 된 호출도 재시도하나요?

**기대 답변:**
하지 않습니다.
- 재시도 가능: GET, 멱등키가 있는 POST/PUT/DELETE
- 재시도 금지: 멱등키 없는 결제/주문 생성

서버가 멱등키를 받아 처리 이력을 저장하면 클라이언트는 안심하고 재시도 가능합니다.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 결제 호출에 *타임아웃 시 자동 재시도*를 걸었음. 그런데 PG사가 *결제는 처리했지만 응답이 네트워크 지연으로 늦게* 온 경우, 클라이언트가 timeout으로 판단해 *재시도 → 이중 결제* 사고.

**진단:**
- "타임아웃 = 실패"라고 가정하고 재시도했지만, *타임아웃은 "결과를 모름"* 이지 실패가 아님
- 결제는 *멱등성이 없으면* 재시도가 곧 중복 청구
- 멱등키 없는 POST(생성)는 *재시도하면 안 되는* 호출이었음

**조치 — 멱등키 기반 안전 재시도:**
- 결제 요청에 *클라이언트가 생성한 `Idempotency-Key`* 첨부
- 서버는 *(key, 결과)* 를 저장 → 같은 키 재요청 시 *처리 안 하고 저장된 결과 반환*
- 멱등키가 있으니 *재시도가 안전*해짐 (중복 처리 불가)

**결과:**
- 이중 결제 사고 0건
- 멱등키 덕에 *타임아웃 시 안심하고 재시도* 가능 (결제 성공률도 상승)

**교훈:** *타임아웃은 "실패"가 아니라 "결과 모름"* 이다. **멱등성이 없는 호출(멱등키 없는 결제/주문 생성)을 재시도하면 중복 처리**된다. 재시도가 필요하면 *먼저 멱등키를 설계*해서 *서버가 중복을 무해화*하게 만든다.

</details>

### 🔄 꼬리질문 3: 서킷 브레이커와 재시도 jitter를 어떻게 조합하나요?

**기대 답변:**
- 서킷 Open이면 재시도 자체 차단 (즉시 Fallback)
- 서킷 Closed/Half-open일 때만 재시도 (지수 백오프 + Full Jitter)
- 재시도 횟수는 서킷 카운트에서 분리해 별도 메트릭으로 관측

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** PG사 장애 시, 서킷이 이미 Open인데도 *재시도 로직이 계속 5번씩 재시도*를 돌려 *이미 죽은 PG사에 헛된 폭격*을 가하고, 그 재시도들이 *서킷 복구(Half-Open) 판단까지 교란*.

**진단:**
- 데코레이터 순서가 *Retry 바깥 / CircuitBreaker 안쪽* → 서킷이 Open이어도 재시도가 먼저 돌고 매번 서킷에 막힘 (헛수고)
- 재시도 실패가 서킷 메트릭을 오염

**조치 — 순서·역할 정렬:**
- 데코레이터 순서: **CircuitBreaker(바깥) → Retry(안쪽)** → 서킷 Open이면 *재시도 시도조차 안 하고 즉시 Fallback*
- 서킷 Closed/Half-Open에서만 *Full Jitter 재시도* 동작
- 재시도 카운트와 서킷 카운트를 *Micrometer로 분리* 관측 (서로 오염 안 되게)

**결과:**
- 서킷 Open 시 *재시도 없이 즉시 fallback* (죽은 PG사 폭격 중단)
- 서킷 복구 판단이 재시도에 교란되지 않음

**교훈:** 서킷 브레이커와 재시도 jitter는 **순서가 핵심 — CircuitBreaker가 바깥, Retry가 안쪽**이다. 그래야 *Open 시 재시도 자체가 차단*된다. 반대로 두면 *죽은 의존성에 헛된 재시도 폭격* + *서킷 복구 판단 교란*. 메트릭도 분리해 서로 오염을 막는다.

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
