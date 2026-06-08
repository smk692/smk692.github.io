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

### 🔄 꼬리질문 1: 분산 환경에서 정합성은 어떻게 보장하나요?

**기대 답변:**
- Redis + **Lua 스크립트**로 read-modify-write 원자성 확보
- 키 = `userId:windowStart` 형태
- 단일 인스턴스 카운트의 race condition을 방지

Redis 클러스터에선 같은 키가 같은 슬롯에 떨어지도록 hashtag 사용.

### 🔄 꼬리질문 2: Sliding Window의 메모리 비용은 어떻게 관리하나요?

**기대 답변:**
- 정확한 sliding은 요청 타임스탬프를 모두 저장 → 메모리 폭증
- 운영에선 **Sliding Window Counter**(현재·이전 윈도우 가중 평균)로 절충
- TTL을 짧게 둬 자동 정리

### 🔄 꼬리질문 3: 클라이언트가 한도 초과면 어떤 응답을 주나요?

**기대 답변:**
- `429 Too Many Requests` + `Retry-After` 헤더
- `X-RateLimit-*` 헤더로 잔여량 노출
- 큐 기반 비동기 백오프 권장 (지수 + jitter)

---

## 2. Bulkhead 패턴

### Q2. Bulkhead로 자원을 어떻게 격리하시나요?

**기대 답변:**
**자원 사용의 한계선을 미리 그어두는** 격리 방식입니다.
- 외부 API 호출별 스레드 풀 분리
- DB 커넥션 풀을 endpoint 그룹별로 분리
- 컨테이너 CPU/메모리 limit 분리

한 곳의 폭주가 전체 가용 자원을 잡아먹지 못하게 합니다.

### 🔄 꼬리질문 1: 임계치는 어떻게 산정하나요?

**기대 답변:**
- 평소 트래픽의 p99 처리에 필요한 동시성 × 1.5 ~ 2배
- 최대 throughput에서 latency가 급격히 꺾이는 지점 (knee)
- 실험적으로 부하 테스트(k6, JMeter)로 검증

### 🔄 꼬리질문 2: 풀 분리의 오버헤드는 없나요?

**기대 답변:**
- 스레드 풀 분리는 메모리·컨텍스트 스위치 비용 증가
- 트래픽이 적은 풀은 미사용 자원 낭비
- → 핵심 의존성만 분리, 나머지는 공유 풀 사용이 일반적

Virtual Thread 환경이면 스레드 풀 대신 **세마포어**로 동시성 상한.

### 🔄 꼬리질문 3: 거절 전략은 어떻게 설계하나요?

**기대 답변:**
- 큐 가득 차면 즉시 거절 (`RejectedExecutionException`)
- 비즈니스에 따라 캐시된 stale 데이터로 fallback
- 클라이언트에 `503 Service Unavailable` + `Retry-After`

---

## 3. Circuit Breaker

### Q3. 서킷 브레이커 임계값과 Fallback UX는 어떻게 설계했나요?

**기대 답변:**
3축:
1. **스레드 풀 고갈 원인 파악**: 외부 API 지연이 톰캣 스레드 잠식
2. **지표 기반 임계치**: p99 2초 타임아웃 + 에러율 30% 초과 시 Open
3. **비즈니스 맥락 Fallback**: 무한 로딩 대신 "연동 지연 안내" 같은 명확한 응답

### 🔄 꼬리질문 1: Half-open에서 복구 기준은?

**기대 답변:**
- 일정 시간(예: 30초) 후 소수 요청만 통과시켜 시험
- 성공률 N% 넘으면 Closed로 복귀
- 실패하면 다시 Open + 대기 시간 지수 증가

### 🔄 꼬리질문 2: Fallback의 데이터 품질은 어떻게 다루나요?

**기대 답변:**
- 캐시된 stale 데이터에 **시점 표시** ("3분 전 기준")
- 빈 응답 vs stale, 도메인에 따라 결정 (결제는 빈 응답, 추천은 stale)
- 사용자 경험에서 *오답*과 *지연*의 비용 비교

### 🔄 꼬리질문 3: 서킷 브레이커와 재시도를 같이 쓸 때 주의점은?

**기대 답변:**
- 서킷이 Open이면 재시도하지 않음 (즉시 Fallback)
- 재시도 → 서킷 카운트 영향 분리 (재시도 누적이 서킷을 잘못 열게 함)
- 재시도는 idempotent 호출에만

---

## 4. Timeout Cascade

### Q4. 호출 체인 전체에서 타임아웃을 어떻게 분배하나요?

**기대 답변:**
- 상위 SLO에서 시작해 **하위로 갈수록 줄여** 분배 (deadline propagation)
- 네트워크·재시도 여유까지 빼고 남은 시간으로 하위 호출
- gRPC `Deadline`, OpenTelemetry baggage 활용

일률적 타임아웃은 cascade를 막지 못합니다.

### 🔄 꼬리질문 1: 일률적 5초 타임아웃의 문제는?

**기대 답변:**
- 상위가 4초에 응답해야 하는데 하위 5초 대기 → 무의미한 대기
- 하위가 이미 죽었는데 상위가 재시도 → 회복 자체를 막음
- 클라이언트가 끊겨도 서버는 계속 작업 → 자원 낭비

### 🔄 꼬리질문 2: deadline propagation을 어떻게 구현하나요?

**기대 답변:**
- gRPC: 메타데이터 `grpc-timeout` 자동 전파
- HTTP: 커스텀 헤더(예: `X-Deadline-Ms`) + 인터셉터에서 남은 시간 계산
- 컨텍스트(Spring `WebClient`의 `responseTimeout`)에 남은 deadline 반영

### 🔄 꼬리질문 3: 클라이언트 cancel을 백엔드까지 어떻게 전파하나요?

**기대 답변:**
- HTTP/2 RST_STREAM, gRPC client cancel은 자동 전파
- Servlet은 `AsyncContext` + 클라이언트 disconnect 감지
- Reactive(WebFlux)는 Publisher cancel 자동 전파
- 백엔드에서 DB 쿼리도 cancel(`pg_cancel_backend`)까지 연결

---

## 5. 멱등성과 재시도 Jitter

### Q5. 외부 API 재시도에서 단순 지수 백오프만 적용하면 어떤 문제가 생기나요?

**기대 답변:**
복구 시점에 멈춰있던 요청이 **동시에 재시도하며 의존성 서버를 다시 죽이는** thundering herd가 발생합니다.

3축:
1. **지수 백오프**로 점진적 부하 감소
2. **Jitter(난수)** 부여로 재시도 시점 분산
3. **Full Jitter** 채택으로 복구 피크 완화

### 🔄 꼬리질문 1: Full Jitter vs Equal Jitter는 어떻게 다른가요?

**기대 답변:**
- **Full Jitter**: `sleep = random(0, base * 2^attempt)` — 가장 평탄
- **Equal Jitter**: `sleep = base * 2^attempt / 2 + random(0, base * 2^attempt / 2)`
- **Decorrelated Jitter**: 이전 sleep에 비례 — AWS SDK 표준

대부분의 케이스에서 **Full Jitter**가 thundering herd를 가장 잘 막습니다.

### 🔄 꼬리질문 2: 멱등성이 보장 안 된 호출도 재시도하나요?

**기대 답변:**
하지 않습니다.
- 재시도 가능: GET, 멱등키가 있는 POST/PUT/DELETE
- 재시도 금지: 멱등키 없는 결제/주문 생성

서버가 멱등키를 받아 처리 이력을 저장하면 클라이언트는 안심하고 재시도 가능합니다.

### 🔄 꼬리질문 3: 서킷 브레이커와 재시도 jitter를 어떻게 조합하나요?

**기대 답변:**
- 서킷 Open이면 재시도 자체 차단 (즉시 Fallback)
- 서킷 Closed/Half-open일 때만 재시도 (지수 백오프 + Full Jitter)
- 재시도 횟수는 서킷 카운트에서 분리해 별도 메트릭으로 관측

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
