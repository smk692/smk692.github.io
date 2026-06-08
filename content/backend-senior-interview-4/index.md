---
layout: post
emoji: 🧵
title: "시니어 백엔드 면접 질문 4편 - 동시성/런타임 (5~10년차)"
date: '2026-06-08 23:30:00'
author: 손(Son/손민기)
tags: 백엔드 면접 시니어 동시성 LockFree CAS 자바메모리모델 VirtualThread 데드락 꼬리질문
categories: CS
series: "시니어 백엔드 면접 질문"
---

시니어 백엔드 면접에서 동시성은 단순히 "동기화 안다"가 아니라 **무엇이 비용인지**, **어떤 운영 신호로 확인하는지**를 봅니다.

이번 편에서는 면접관 입장에서 어떤 동시성 질문을 던지고, 어떤 꼬리질문으로 실력을 검증할지 정리했습니다.

**시리즈 구성:**
- 1편: 인프라/스케일링
- 2편: 운영/안정성
- 3편: 설계/리더십
- **4편 (현재)**: 동시성/런타임
- 5편 (예정): 분산/MSA 아키텍처

---

## 1. Lock-Free와 CAS

### Q1. Lock-Free가 뭐고 어떤 상황에서 채택하시나요?

**기대 답변:**
뮤텍스 없이 CAS(Compare-And-Swap) 같은 원자 연산으로 동시성을 제어하는 방식입니다. 핵심은 컨텍스트 스위칭 회피가 아니라 **최소 1개 스레드의 진전 보장(progress guarantee)** 입니다.

채택 조건: 임계영역이 매우 짧고, 경합이 낮~중간, 마이크로초 단위 지연 SLO가 있을 때.

### 🔄 꼬리질문 1: CAS가 실제로 빨라지는 조건은 뭔가요?

**기대 답변:**
- 임계영역이 짧고(< 100ns) 경합률이 낮을 때
- 같은 NUMA 노드에 묶여 캐시 라인 무효화 비용이 작을 때
- `@Contended` 등으로 false sharing을 막았을 때

경합이 심해지면 retry 폭주로 락보다 느려집니다.

### 🔄 꼬리질문 2: ABA 문제는 어떻게 막나요?

**기대 답변:**
값이 `A→B→A`로 돌아왔을 때 CAS가 "같다"로 판정하는 문제입니다.
- **Tagged Pointer**: 값 + 카운터를 한 워드에 묶기 (자바 `AtomicStampedReference`)
- **Hazard Pointer**: 사용 중인 노드를 공개해 해제 차단
- **Epoch-Based Reclamation**: 같은 epoch에서만 해제

GC가 있는 자바라도 객체 풀에선 ABA가 나옵니다.

### 🔄 꼬리질문 3: 경합이 심해지면 어떤 운영 신호를 봐야 하나요?

**기대 답변:**
- **CAS retry 비율**: `casSuccess / casAttempts`가 0.5 미만이면 위험
- **CPU 100%인데 throughput 감소**: 스핀 폭주 신호
- **컨텍스트 스위치 폭증**: OS가 스핀을 깨고 있다는 뜻

대응으로 adaptive spinning이나 `LongAdder` 같은 striping으로 핫 키 자체를 분산합니다.

---

## 2. Happens-Before와 자바 메모리 모델

### Q2. `volatile`만 붙이면 가시성 문제가 다 해결되나요?

**기대 답변:**
아니요. `volatile`은 그 변수 하나의 read/write 가시성만 보장합니다.
- 복합 연산(`counter++`)은 보호 못 함 → `AtomicInteger`
- 여러 변수 간 정렬도 부분적
- 주변 코드의 컴파일러 재정렬은 막지 못함

happens-before를 명시적으로 만들려면 `synchronized`, `Lock`, `Thread.start/join`, `AtomicXxx`의 release/acquire를 씁니다.

### 🔄 꼬리질문 1: `synchronized`와 `volatile`의 happens-before 차이는?

**기대 답변:**
- `synchronized`: 임계영역 전체의 write가 다음 lock 획득자에게 가시화. 복합 연산도 보호.
- `volatile`: 그 변수 write가 같은 변수 read 시점에 happens-before. 복합 연산은 보호 안 됨.

성능은 `volatile`이 가볍지만 보호 범위가 좁습니다.

### 🔄 꼬리질문 2: 컴파일러 재정렬이 문제가 되는 케이스는?

**기대 답변:**
대표적으로 **double-checked locking** 버그입니다. `instance = new Resource()`에서 *참조 대입*이 *생성자 완료*보다 먼저 보이면 다른 스레드가 미초기화 객체를 받습니다.

해결: 필드에 `volatile` 추가, 또는 static holder 패턴(클래스 초기화의 happens-before)을 사용.

x86은 정렬이 강해 안 보이지만, ARM/PowerPC에선 실측에서 잡힙니다.

### 🔄 꼬리질문 3: 다른 언어 메모리 모델과 비교하면?

**기대 답변:**
- **Go**: 채널·`sync.Mutex`가 happens-before. `sync/atomic`이 release/acquire 노출
- **Rust**: 컴파일 타임에 데이터 레이스 차단. `Send`/`Sync` trait
- **C++**: `std::memory_order`로 가장 세밀한 제어. 자바 `volatile`은 C++ `seq_cst`에 가까움

---

## 3. Virtual Thread (Project Loom)

### Q3. Virtual Thread를 도입하면 무조건 빨라지나요?

**기대 답변:**
아닙니다. **I/O 대기가 긴 워크로드**에서만 throughput이 늡니다.

효과 없는 경우:
- CPU 바운드 (캐리어 풀은 결국 코어 수)
- 외부 의존성이 동시성 제약 (DB 커넥션 풀 50개면 그게 상한)
- 레이턴시 최적화가 목표일 때 (Loom은 throughput 도구)

가장 큰 실효는 비동기 콜백/`CompletableFuture`로 꼬인 코드를 동기 스타일로 다시 쓸 수 있다는 점입니다.

### 🔄 꼬리질문 1: Pinning 이슈가 뭔가요?

**기대 답변:**
가상 스레드가 캐리어 OS 스레드에 묶여서 unmount되지 못하는 현상입니다.
- `synchronized` 안에서 blocking I/O → `ReentrantLock`으로 교체
- JNI 안에서 blocking
- 일부 legacy `Object.wait` 패턴 (JDK 21~24에서 점진 개선)

진단은 JFR `jdk.VirtualThreadPinned` 이벤트로 stack과 함께 잡습니다.

### 🔄 꼬리질문 2: 기존 스레드 풀 코드를 마이그레이션할 때 주의점은?

**기대 답변:**
- 풀 사이즈 튜닝이 사라지고, **세마포어로 동시성 상한**을 거는 패턴으로 바뀜
- `ThreadLocal`은 메모리 부담이 커짐 → JDK 21 **Scoped Values** 검토
- 일부 APM이 Virtual Thread를 OS 스레드로 잘못 집계 → 에이전트 버전 확인

### 🔄 꼬리질문 3: Reactive(WebFlux) vs Virtual Thread, 어느 쪽?

**기대 답변:**
- 팀 친숙도가 동기 스타일이면 Loom
- 사용 중인 드라이버가 blocking-friendly (JDBC) → Loom, R2DBC 같은 reactive → 그대로
- 백프레셔·스트리밍이 핵심이면 Reactive
- 수십만 동시 연결 메모리 효율이면 Reactive

신규는 Loom, 잘 도는 Reactive는 유지가 합리적입니다.

---

## 4. Deadlock 추적과 운영

### Q4. 운영 중 데드락을 경험한 적 있나요? 어떻게 추적했나요?

**기대 답변:**
교과서 4조건보다 **현장 추적 절차**가 중요합니다.
- PostgreSQL: `pg_stat_activity` + `pg_locks` 조인, `log_lock_waits = on`
- MySQL: `SHOW ENGINE INNODB STATUS`의 LATEST DETECTED DEADLOCK
- 자바: `jstack`의 "Found Java-level deadlock", JFR `jdk.JavaMonitorEnter`, async-profiler `--lock`

복구는 단기 타임아웃+재시도, 장기 자원 접근 순서 정렬입니다.

### 🔄 꼬리질문 1: 자원 접근 순서 정렬 vs 타임아웃, 어느 쪽이 우선?

**기대 답변:**
**순서 정렬이 먼저, 타임아웃은 안전망**입니다.
- 송금 락은 `min(srcId, dstId)`부터 잡기
- 여러 테이블 락은 항상 동일한 alphabetical 순서

타임아웃만 의존하면 데드락이 *간헐적 실패*로 숨어 피크 때 폭증합니다.

### 🔄 꼬리질문 2: DB 데드락과 애플리케이션 데드락은 어떻게 구분하나요?

**기대 답변:**
- **DB**: DB가 한쪽을 victim으로 자동 abort, `DeadlockException` 발생, DB의 `deadlocks` 카운터로 추적
- **앱**: 자동 해제 없음, 요청 hang, CPU 0%인데 throughput drop, jstack으로 추적

DB는 인덱스 부재의 gap lock 확장, 앱은 외부 호출 → 자기 호출 같은 콜백 사이클이 흔합니다.

### 🔄 꼬리질문 3: 데드락 모니터링을 자동화한다면?

**기대 답변:**
3단 알람:
1. **Warning**: lock wait p99 > 1초
2. **Critical**: DB `deadlocks` 카운터 delta, 앱은 락 ID×스레드 ID cycle 탐지
3. **자동 복구**: 재시도(jitter backoff), 임계 초과 시 k8s liveness probe로 컨테이너 재시작 + `jstack` snapshot을 S3 업로드

---

## 5. 비관적 → 낙관적 락 전환

### Q5. 비관적 락으로 처리량이 떨어졌을 때 낙관적 락으로 전환한다면 재시도 정책은?

**기대 답변:**
쿠폰·좌석·재고 같은 전형 사례에서, `SELECT FOR UPDATE`로 대기 큐가 길어져 DB 커넥션이 고갈됩니다.

낙관적 락 재시도의 3축:
1. **재시도 제한**: 최대 3~5회 (`OptimisticLockingFailureException`)
2. **백오프 + jitter**: 50ms 지수 백오프, 동시 재시도 분산
3. **실패 UX**: 큐로 비동기 처리 or 부분 성공 응답

### 🔄 꼬리질문 1: 충돌율이 높아지면 낙관적 락이 더 비싸진다는데, 판단 기준은?

**기대 답변:**
- 충돌율 5% 미만이면 유리, 30% 넘으면 손해
- p99 응답시간이 평균보다 튀면 충돌 누적 신호
- DB CPU 상승

대안: 핫 키 샤딩(`stock_001` ~ `stock_010`), 큐 직렬화, Redis Lua 스크립트.

### 🔄 꼬리질문 2: 재시도를 다 소진하고도 실패하면?

**기대 답변:**
- 결제·예약: 즉시 실패 + 명확한 메시지 (silent retry 금지)
- 카운터·집계: 비동기 큐로 eventual consistency, DLQ 백업
- 알림: 워커 큐 재전송, 24시간 후 운영 알람

**멱등키**를 함께 설계해야 클라이언트 재시도에도 한 번만 처리됩니다.

### 🔄 꼬리질문 3: AOP 기반 재시도(`@Retryable`)의 한계는?

**기대 답변:**
- **자가 호출 문제**: 프록시를 안 거쳐 동작 안 함 → 빈 분리 또는 AspectJ
- **트랜잭션 경계 어긋남**: `@Transactional` 안에서 재시도하면 락이 안 풀림 → 트랜잭션 밖에서 재시도
- **재시도 가능 예외 식별**: 비즈니스 에러까지 반복 금지 — 락 관련 예외만 선별
- **관찰성**: Micrometer `retry.calls` 메트릭으로 충돌율 모니터링

---

## 마무리: 4편 핵심 정리

1. **Lock-Free**: 진전 보장, CAS retry율과 ABA 방어까지
2. **메모리 모델**: `volatile`의 한계, happens-before 관계 명시
3. **Virtual Thread**: throughput 도구, Pinning 이슈 인지
4. **Deadlock**: 4조건이 아니라 자원 순서 정렬 + 추적 절차
5. **낙관적 락**: 충돌율 임계값, 재시도 경계, 멱등키 결합

다음 5편에서는 **분산/MSA 아키텍처** — SAGA, CQRS, API Gateway, DDD, 도메인 이벤트와 아웃박스 패턴을 다룹니다.

```toc
```
