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

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 광고 클릭 카운터 — 초당 10만 클릭, 단일 광고 키에 카운트 증가. `AtomicLong`으로 시작했으나 CPU 폭증.

**진단:**
- `AtomicLong.incrementAndGet()`은 *단일 캐시 라인*에 모든 스레드가 CAS retry
- JFR 측정: retry 비율 78%, CPU 95%인데 throughput 정체
- 24코어 머신인데 사실상 1코어가 캐시 라인을 독점

**전환 — `LongAdder` (striping):**
- 내부적으로 여러 cell에 분산해서 카운트, 읽을 때만 합산
- 같은 작업이지만 캐시 라인 충돌이 거의 사라짐

```java
// Before
private final AtomicLong clicks = new AtomicLong();
clicks.incrementAndGet();

// After
private final LongAdder clicks = new LongAdder();
clicks.increment();
```

**결과:**
- CPU 95% → 35%
- Throughput 8만 → 28만 ops/sec (3.5배)
- retry 비율 측정 불가 수준으로 감소

**교훈:**
- CAS는 *경합이 낮을 때만* 빠름. 단일 핫 키는 락보다 못 함
- **Striping(LongAdder, Striped64)** 이 "Lock-Free + 분산"의 정석 패턴
- 운영에서는 *retry 비율*과 *CPU vs throughput 곡선*을 항상 같이 봄

</details>

### 🔄 꼬리질문 1: CAS가 실제로 빨라지는 조건은 뭔가요?

**기대 답변:**
- 임계영역이 짧고(< 100ns) 경합률이 낮을 때
- 같은 NUMA 노드에 묶여 캐시 라인 무효화 비용이 작을 때
- `@Contended` 등으로 false sharing을 막았을 때

경합이 심해지면 retry 폭주로 락보다 느려집니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

`AtomicReference` 기반 lock-free 큐가 NUMA 노드 간에서 30% 느림 → `@Contended`로 64바이트 패딩 추가 → false sharing 제거, 처리량 회복. **교훈: lock-free 자료구조는 *캐시 라인 정렬*까지 신경 써야 진가.**

</details>

### 🔄 꼬리질문 2: ABA 문제는 어떻게 막나요?

**기대 답변:**
값이 `A→B→A`로 돌아왔을 때 CAS가 "같다"로 판정하는 문제입니다.
- **Tagged Pointer**: 값 + 카운터를 한 워드에 묶기 (자바 `AtomicStampedReference`)
- **Hazard Pointer**: 사용 중인 노드를 공개해 해제 차단
- **Epoch-Based Reclamation**: 같은 epoch에서만 해제

GC가 있는 자바라도 객체 풀에선 ABA가 나옵니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

객체 풀 기반 lock-free 스택에서 ABA로 *해제된 노드 재참조* 사고 → 디버깅 1주. `AtomicStampedReference`로 버전 태깅 추가 후 재발 0건. **교훈: GC 있다고 ABA 안전 X, 객체 풀 패턴은 별도 보호.**

</details>

### 🔄 꼬리질문 3: 경합이 심해지면 어떤 운영 신호를 봐야 하나요?

**기대 답변:**
- **CAS retry 비율**: `casSuccess / casAttempts`가 0.5 미만이면 위험
- **CPU 100%인데 throughput 감소**: 스핀 폭주 신호
- **컨텍스트 스위치 폭증**: OS가 스핀을 깨고 있다는 뜻

대응으로 adaptive spinning이나 `LongAdder` 같은 striping으로 핫 키 자체를 분산합니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

광고 클릭 시스템에서 CPU 95%인데 throughput 감소 → `vmstat`로 context switch 폭증 확인, JFR로 retry 비율 78% 확인. striping 전환으로 해결. **교훈: 세 지표를 *조합해서 봐야* 진단 가능.**

</details>

---

## 2. Happens-Before와 자바 메모리 모델

### Q2. `volatile`만 붙이면 가시성 문제가 다 해결되나요?

**기대 답변:**
아니요. `volatile`은 그 변수 하나의 read/write 가시성만 보장합니다.
- 복합 연산(`counter++`)은 보호 못 함 → `AtomicInteger`
- 여러 변수 간 정렬도 부분적
- 주변 코드의 컴파일러 재정렬은 막지 못함

happens-before를 명시적으로 만들려면 `synchronized`, `Lock`, `Thread.start/join`, `AtomicXxx`의 release/acquire를 씁니다.

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 회원 캐시 싱글톤 초기화 코드에서 *간헐적 NPE*. 재현율 0.001%, 그러나 일 1억 요청 환경에서 매일 1,000건 발생.

**문제 코드 (Double-Checked Locking):**
```java
public class MemberCache {
  private static MemberCache instance;  // volatile 누락 🚨

  public static MemberCache getInstance() {
    if (instance == null) {
      synchronized (MemberCache.class) {
        if (instance == null) {
          instance = new MemberCache();  // 1) 메모리 할당
                                          // 2) 생성자 호출 (필드 초기화)
                                          // 3) 참조 대입
        }
      }
    }
    return instance;  // 다른 스레드가 *초기화 안 된 객체*를 받을 수 있음
  }
}
```

**왜 재현이 어려웠나:**
- x86은 store-store 정렬이 강해 거의 안 보임
- 우리 ARM 기반 신규 인스턴스에서만 발생 → ARM은 weak memory model

**해결:**
```java
private static volatile MemberCache instance;  // volatile 추가
```

또는 더 안전하게 **Static Holder Pattern**:
```java
private static class Holder {
  static final MemberCache INSTANCE = new MemberCache();
}
public static MemberCache getInstance() {
  return Holder.INSTANCE;  // 클래스 초기화의 happens-before 보장
}
```

**결과:**
- NPE 완전히 사라짐
- ARM 인스턴스 비율을 50%로 확대해도 안정

**교훈:**
- DCL은 **`volatile` 누락 시 메모리 모델 약한 CPU에서 폭발**
- 현대 자바에선 Static Holder가 가독성·안전성 모두 우월
- *재현 안 되는 NPE*는 메모리 모델 의심해보기

</details>

### 🔄 꼬리질문 1: `synchronized`와 `volatile`의 happens-before 차이는?

**기대 답변:**
- `synchronized`: 임계영역 전체의 write가 다음 lock 획득자에게 가시화. 복합 연산도 보호.
- `volatile`: 그 변수 write가 같은 변수 read 시점에 happens-before. 복합 연산은 보호 안 됨.

성능은 `volatile`이 가볍지만 보호 범위가 좁습니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

`volatile counter++` 패턴이 한 곳에서 누적 누락 — read-modify-write가 atomic 아님. `AtomicInteger`로 교체 후 누락 0건. **교훈: volatile은 *단일 read/write*만 보장, 복합 연산은 별도 도구.**

</details>

### 🔄 꼬리질문 2: 컴파일러 재정렬이 문제가 되는 케이스는?

**기대 답변:**
대표적으로 **double-checked locking** 버그입니다. `instance = new Resource()`에서 *참조 대입*이 *생성자 완료*보다 먼저 보이면 다른 스레드가 미초기화 객체를 받습니다.

해결: 필드에 `volatile` 추가, 또는 static holder 패턴(클래스 초기화의 happens-before)을 사용.

x86은 정렬이 강해 안 보이지만, ARM/PowerPC에선 실측에서 잡힙니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

ARM 기반 Graviton 인스턴스로 일부 옮기자 *재현 안 되던 NPE*가 매일 등장 → DCL 버그였음. volatile 추가로 해결. **교훈: 멀티 아키텍처 환경에선 *weak memory model* 가정으로 코드 작성.**

</details>

### 🔄 꼬리질문 3: 다른 언어 메모리 모델과 비교하면?

**기대 답변:**
- **Go**: 채널·`sync.Mutex`가 happens-before. `sync/atomic`이 release/acquire 노출
- **Rust**: 컴파일 타임에 데이터 레이스 차단. `Send`/`Sync` trait
- **C++**: `std::memory_order`로 가장 세밀한 제어. 자바 `volatile`은 C++ `seq_cst`에 가까움

<details>
<summary>📋 <b>사례</b></summary>

<br/>

Go 마이그레이션 시 자바 `volatile` 감각으로 작성했다가 데이터 레이스 — `sync.Mutex` 또는 채널로 명시 필요. `go test -race`로 발견. **교훈: 언어마다 *기본 안전 가정*이 달라, 코드 옮길 때 메모리 모델부터 재확인.**

</details>

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

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 상품 상세 API — 외부 5개 시스템(가격, 재고, 리뷰, 추천, 배송) 호출 후 조합. 평균 800ms, 톰캣 스레드 200개로 7,000 RPS가 한계.

**기존 구조 (CompletableFuture):**
```java
CompletableFuture<Price> price = CompletableFuture.supplyAsync(...);
CompletableFuture<Stock> stock = CompletableFuture.supplyAsync(...);
// ... 콜백 지옥
CompletableFuture.allOf(...).thenApply(...);
```
- 코드 가독성 최악, 디버깅 어려움
- 스레드 풀 튜닝에 매번 시달림

**Virtual Thread 도입 (JDK 21):**
```java
@RequestMapping
public ProductDetail getDetail(Long id) {
  try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    var priceTask = scope.fork(() -> priceClient.get(id));
    var stockTask = scope.fork(() -> stockClient.get(id));
    var reviewTask = scope.fork(() -> reviewClient.get(id));
    var recoTask = scope.fork(() -> recoClient.get(id));
    var shipTask = scope.fork(() -> shipClient.get(id));
    scope.join();
    scope.throwIfFailed();
    return combine(priceTask.get(), stockTask.get(), ...);
  }
}
```
- Tomcat → Executors.newVirtualThreadPerTaskExecutor() 전환
- DB 커넥션 풀은 50 유지, 외부 호출별 세마포어로 동시성 상한

**결과:**
- 7,000 → 38,000 RPS (5.4배)
- p99 latency는 동일 (800ms — 외부 호출 속도가 본질)
- 코드 가독성: callback hell → 동기 스타일 직선 코드

**주의 사항 — Pinning 사고:**
- 외부 클라이언트가 내부적으로 `synchronized` 블록에서 I/O → 캐리어 묶임
- JFR `jdk.VirtualThreadPinned` 이벤트로 발견
- 클라이언트 라이브러리를 `ReentrantLock` 기반으로 교체

**교훈:**
- Loom은 *latency 도구가 아니라 throughput 도구*
- 도입 즉시 모든 게 빨라지는 게 아니라 *세마포어·Pinning·APM 호환성*까지 같이 챙겨야 함
- 가장 큰 가치는 사실 **코드 가독성 회복**

</details>

### 🔄 꼬리질문 1: Pinning 이슈가 뭔가요?

**기대 답변:**
가상 스레드가 캐리어 OS 스레드에 묶여서 unmount되지 못하는 현상입니다.
- `synchronized` 안에서 blocking I/O → `ReentrantLock`으로 교체
- JNI 안에서 blocking
- 일부 legacy `Object.wait` 패턴 (JDK 21~24에서 점진 개선)

진단은 JFR `jdk.VirtualThreadPinned` 이벤트로 stack과 함께 잡습니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

Loom 도입 후 throughput 1.5배밖에 안 늘어 의아 → JFR `jdk.VirtualThreadPinned` 이벤트로 *HttpClient 내부 synchronized I/O* 발견. ReentrantLock 기반 클라이언트로 교체 후 5배 증가. **교훈: Pinning 진단 없는 Loom은 *반쪽짜리*.**

</details>

### 🔄 꼬리질문 2: 기존 스레드 풀 코드를 마이그레이션할 때 주의점은?

**기대 답변:**
- 풀 사이즈 튜닝이 사라지고, **세마포어로 동시성 상한**을 거는 패턴으로 바뀜
- `ThreadLocal`은 메모리 부담이 커짐 → JDK 21 **Scoped Values** 검토
- 일부 APM이 Virtual Thread를 OS 스레드로 잘못 집계 → 에이전트 버전 확인

<details>
<summary>📋 <b>사례</b></summary>

<br/>

Datadog APM이 Virtual Thread를 *각 OS 스레드*로 잘못 집계 → 동시 스레드 수치가 50배 부풀려져 알람 폭증. 에이전트 v1.x → v2.x 업그레이드로 해결. **교훈: Loom 도입은 *모니터링 호환성*까지 검증.**

</details>

### 🔄 꼬리질문 3: Reactive(WebFlux) vs Virtual Thread, 어느 쪽?

**기대 답변:**
- 팀 친숙도가 동기 스타일이면 Loom
- 사용 중인 드라이버가 blocking-friendly (JDBC) → Loom, R2DBC 같은 reactive → 그대로
- 백프레셔·스트리밍이 핵심이면 Reactive
- 수십만 동시 연결 메모리 효율이면 Reactive

신규는 Loom, 잘 도는 Reactive는 유지가 합리적입니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

WebFlux로 잘 도는 결제 모듈은 유지, JDBC 기반 신규 추천 모듈은 Loom 채택. 양립 운영 1년 — 팀별 친숙도와 도메인 특성으로 선택. **교훈: *한 가지로 통일*이 답이 아니라 *도메인별 적합성* 우선.**

</details>

---

## 4. Deadlock 추적과 운영

### Q4. 운영 중 데드락을 경험한 적 있나요? 어떻게 추적했나요?

**기대 답변:**
교과서 4조건보다 **현장 추적 절차**가 중요합니다.
- PostgreSQL: `pg_stat_activity` + `pg_locks` 조인, `log_lock_waits = on`
- MySQL: `SHOW ENGINE INNODB STATUS`의 LATEST DETECTED DEADLOCK
- 자바: `jstack`의 "Found Java-level deadlock", JFR `jdk.JavaMonitorEnter`, async-profiler `--lock`

복구는 단기 타임아웃+재시도, 장기 자원 접근 순서 정렬입니다.

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 사용자 간 송금 API에서 *간헐적 hang*. 특정 시간대에 트랜잭션 5초씩 멈춤.

**진단 1 — DB 측 (PostgreSQL):**
```sql
SELECT * FROM pg_stat_activity
WHERE wait_event_type = 'Lock';
```
- 두 트랜잭션이 서로의 잠금을 기다리는 cycle 발견
- `pg_locks` 조인으로 `accounts` 테이블의 row exclusive 락 두 개

**원인 코드:**
```kotlin
@Transactional
fun transfer(srcId: Long, dstId: Long, amount: BigDecimal) {
  val src = accountRepo.findByIdForUpdate(srcId)  // (1)
  val dst = accountRepo.findByIdForUpdate(dstId)  // (2)
  src.balance -= amount
  dst.balance += amount
}
```
- 사용자 A → B 송금: `lock(A)` → `lock(B)`
- 동시에 사용자 B → A 송금: `lock(B)` → `lock(A)`
- **순환 대기 → 데드락** (PG가 한쪽을 자동 abort 하지만 5초 wait 후)

**해결 — 자원 순서 정렬:**
```kotlin
@Transactional
fun transfer(srcId: Long, dstId: Long, amount: BigDecimal) {
  val (firstId, secondId) = listOf(srcId, dstId).sorted()
  val first = accountRepo.findByIdForUpdate(firstId)
  val second = accountRepo.findByIdForUpdate(secondId)
  // 이후 src/dst를 식별해 처리
  val (src, dst) = if (first.id == srcId) first to second else second to first
  src.balance -= amount
  dst.balance += amount
}
```
- **항상 작은 ID부터 락** → 순환 대기 불가능

**결과:**
- 데드락 사라짐, p99 latency 5초 spike 사라짐
- `pg_stat_database.deadlocks` 카운터: 일 평균 47건 → 0건

**교훈:**
- 데드락은 *발생하면 알람*이 아니라 *발생 가능한 구조면 제거*
- 자원 순서 정렬은 1줄 코드 변경이지만 영향이 거대함
- 타임아웃(`lock_timeout`)은 안전망일 뿐 근본 해결책 아님

</details>

### 🔄 꼬리질문 1: 자원 접근 순서 정렬 vs 타임아웃, 어느 쪽이 우선?

**기대 답변:**
**순서 정렬이 먼저, 타임아웃은 안전망**입니다.
- 송금 락은 `min(srcId, dstId)`부터 잡기
- 여러 테이블 락은 항상 동일한 alphabetical 순서

타임아웃만 의존하면 데드락이 *간헐적 실패*로 숨어 피크 때 폭증합니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

여러 테이블 락 순서 — 코드 곳곳에서 다른 순서로 잡아 간헐적 데드락. *항상 alphabetical* 강제 + 컨벤션 lint 룰 추가. 이후 데드락 0건. **교훈: 순서 정렬은 *컨벤션화*해야 신규 코드도 안전.**

</details>

### 🔄 꼬리질문 2: DB 데드락과 애플리케이션 데드락은 어떻게 구분하나요?

**기대 답변:**
- **DB**: DB가 한쪽을 victim으로 자동 abort, `DeadlockException` 발생, DB의 `deadlocks` 카운터로 추적
- **앱**: 자동 해제 없음, 요청 hang, CPU 0%인데 throughput drop, jstack으로 추적

DB는 인덱스 부재의 gap lock 확장, 앱은 외부 호출 → 자기 호출 같은 콜백 사이클이 흔합니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

배치 + 실시간 호출이 *같은 모니터 락*에서 데드락 — DB 카운터엔 안 잡힘, CPU 0%인데 throughput 0. jstack `Found Java-level deadlock`으로 발견, `ReentrantLock`으로 교체. **교훈: 앱 데드락은 *자동 해제 없음* → 추적이 어려워 jstack 자동화 필요.**

</details>

### 🔄 꼬리질문 3: 데드락 모니터링을 자동화한다면?

**기대 답변:**
3단 알람:
1. **Warning**: lock wait p99 > 1초
2. **Critical**: DB `deadlocks` 카운터 delta, 앱은 락 ID×스레드 ID cycle 탐지
3. **자동 복구**: 재시도(jitter backoff), 임계 초과 시 k8s liveness probe로 컨테이너 재시작 + `jstack` snapshot을 S3 업로드

<details>
<summary>📋 <b>사례</b></summary>

<br/>

liveness probe가 데드락 감지 시 *jstack snapshot*을 S3로 자동 업로드 후 컨테이너 재시작. 사후 RCA에 결정적 자료. 데드락 평균 복구 시간 30분 → 2분. **교훈: 데드락 감지 시 *증거 보존 + 재시작*을 자동화.**

</details>

---

## 5. 비관적 → 낙관적 락 전환

### Q5. 비관적 락으로 처리량이 떨어졌을 때 낙관적 락으로 전환한다면 재시도 정책은?

**기대 답변:**
쿠폰·좌석·재고 같은 전형 사례에서, `SELECT FOR UPDATE`로 대기 큐가 길어져 DB 커넥션이 고갈됩니다.

낙관적 락 재시도의 3축:
1. **재시도 제한**: 최대 3~5회 (`OptimisticLockingFailureException`)
2. **백오프 + jitter**: 50ms 지수 백오프, 동시 재시도 분산
3. **실패 UX**: 큐로 비동기 처리 or 부분 성공 응답

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 선착순 쿠폰 5,000장 발급. 오픈 1분간 동시 접속 8만. 비관적 락 구조로는 처리량 300 TPS → 발급 완료까지 17분.

**Phase 1 — 비관적 락 (기존):**
```kotlin
@Transactional
fun issueCoupon(userId: Long, couponId: Long) {
  val coupon = couponRepo.findByIdForUpdate(couponId)  // SELECT FOR UPDATE
  if (coupon.remaining <= 0) throw SoldOutException()
  coupon.remaining--
  couponRepo.save(coupon)
  userCouponRepo.save(UserCoupon(userId, couponId))
}
```
- 한 줄에 락 → 대기 큐, TPS 300, 17분 소요
- 사용자 8만 명 중 2만 명 timeout으로 이탈

**Phase 2 — 낙관적 락 (1차 개선):**
```kotlin
@Entity
class Coupon {
  @Version var version: Long = 0  // 낙관적 락
  var remaining: Int = 0
}

@Transactional
fun issueCoupon(userId: Long, couponId: Long) {
  val coupon = couponRepo.findById(couponId)
  if (coupon.remaining <= 0) throw SoldOutException()
  coupon.remaining--
  couponRepo.save(coupon)  // version 자동 증가, 충돌 시 예외
  userCouponRepo.save(UserCoupon(userId, couponId))
}

// AOP 재시도 + jitter
@Retryable(value=[ObjectOptimisticLockingFailureException::class],
  maxAttempts=5, backoff=Backoff(delay=50, multiplier=2.0, random=true))
fun issueCouponWithRetry(...) { issueCoupon(...) }
```
- 충돌율 측정: 단일 키 → 95% 충돌 → retry 폭주
- TPS 800으로 개선됐으나 *DB CPU 80%*

**Phase 3 — Redis Lua (최종):**
```lua
local remaining = redis.call('GET', KEYS[1])
if tonumber(remaining) <= 0 then return -1 end
if redis.call('SETNX', KEYS[2], 1) == 0 then return -2 end  -- 멱등키
return redis.call('DECR', KEYS[1])
```
- DB 락 없이 Redis 단일 노드 원자성 활용
- 발급 완료 후 Kafka로 비동기 DB persist
- TPS 12,000, 5,000장 발급 *25초 만에 완료*

**결과:**
- 17분 → 25초 (40배 단축)
- DB CPU 80% → 15%
- 멱등키로 중복 발급 0건

**교훈:**
- **단일 핫 키**에선 낙관적 락도 한계 → Redis Lua가 정석
- 낙관적 락의 sweet spot은 *충돌율 5~20%* 구간
- 30% 넘으면 비관적 락 or 다른 전략(샤딩·큐 직렬화)으로 전환

</details>

### 🔄 꼬리질문 1: 충돌율이 높아지면 낙관적 락이 더 비싸진다는데, 판단 기준은?

**기대 답변:**
- 충돌율 5% 미만이면 유리, 30% 넘으면 손해
- p99 응답시간이 평균보다 튀면 충돌 누적 신호
- DB CPU 상승

대안: 핫 키 샤딩(`stock_001` ~ `stock_010`), 큐 직렬화, Redis Lua 스크립트.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

재고 차감에 낙관적 락 적용 → 평소 충돌율 3% (OK)지만 *프로모션 시작 1분*만 95% spike로 retry 폭주. 핫 키만 Redis Lua로 분리. **교훈: 충돌율은 *평균*이 아니라 *피크*로 측정.**

</details>

### 🔄 꼬리질문 2: 재시도를 다 소진하고도 실패하면?

**기대 답변:**
- 결제·예약: 즉시 실패 + 명확한 메시지 (silent retry 금지)
- 카운터·집계: 비동기 큐로 eventual consistency, DLQ 백업
- 알림: 워커 큐 재전송, 24시간 후 운영 알람

**멱등키**를 함께 설계해야 클라이언트 재시도에도 한 번만 처리됩니다.

<details>
<summary>📋 <b>사례</b></summary>

<br/>

좌석 예약 실패 시 자동 비동기 큐 전환 — 사용자에겐 "처리 중" 안내 + 5초 후 결과 push. 사용자 이탈률 8% → 1.5%. **교훈: 재시도 소진은 *에러가 아니라 다른 UX 흐름*으로 처리.**

</details>

### 🔄 꼬리질문 3: AOP 기반 재시도(`@Retryable`)의 한계는?

**기대 답변:**
- **자가 호출 문제**: 프록시를 안 거쳐 동작 안 함 → 빈 분리 또는 AspectJ
- **트랜잭션 경계 어긋남**: `@Transactional` 안에서 재시도하면 락이 안 풀림 → 트랜잭션 밖에서 재시도
- **재시도 가능 예외 식별**: 비즈니스 에러까지 반복 금지 — 락 관련 예외만 선별
- **관찰성**: Micrometer `retry.calls` 메트릭으로 충돌율 모니터링

<details>
<summary>📋 <b>사례</b></summary>

<br/>

같은 클래스 안에서 `@Retryable` 메서드를 self-call 했다가 *재시도 동작 안 함* 발견 — 별 빈으로 분리 후 정상 작동. **교훈: AOP는 *프록시 한계*를 항상 의식하고 작성.**

</details>

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
