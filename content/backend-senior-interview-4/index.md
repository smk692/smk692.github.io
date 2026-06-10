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
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** lock-free 큐(`ConcurrentLinkedQueue` 기반)로 만든 작업 디스패처가, 64코어 듀얼 소켓 서버로 옮긴 뒤 *오히려 30% 느려짐*. 코어가 늘었는데 성능이 떨어지는 역설.

**진단:**
- `perf stat`으로 **cache-misses(특히 LLC-miss)** 가 급증한 것 확인
- head/tail 포인터가 *같은 64바이트 캐시 라인*에 인접 → 서로 다른 코어가 각각 갱신하며 *false sharing*
- 듀얼 소켓이라 NUMA 노드 간 캐시 라인 무효화 비용이 단일 소켓보다 큼

**조치:**
- 핫 필드(head/tail/counter)에 `@Contended` 적용 → 64바이트 패딩으로 캐시 라인 분리
- 가능한 작업은 *같은 NUMA 노드 스레드*에 배치

**결과:**
- false sharing 제거로 처리량 회복 + 코어 수 비례 확장
- cache-miss 율 정상화

**교훈:** lock-free라고 자동으로 빠른 게 아니다. **false sharing(캐시 라인 공유)과 NUMA 토폴로지**가 lock-free의 실제 성능을 좌우한다. 핫 필드는 `@Contended`로 캐시 라인을 분리하고, `perf`의 cache-miss를 봐야 한다.

</details>

### 🔄 꼬리질문 2: ABA 문제는 어떻게 막나요?

**기대 답변:**
값이 `A→B→A`로 돌아왔을 때 CAS가 "같다"로 판정하는 문제입니다.
- **Tagged Pointer**: 값 + 카운터를 한 워드에 묶기 (자바 `AtomicStampedReference`)
- **Hazard Pointer**: 사용 중인 노드를 공개해 해제 차단
- **Epoch-Based Reclamation**: 같은 epoch에서만 해제

GC가 있는 자바라도 객체 풀에선 ABA가 나옵니다.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 메모리 할당을 줄이려고 *객체 풀 기반 lock-free 스택*을 직접 구현. 간헐적으로 *이미 해제된(풀에 반납된) 노드를 다시 참조*해 데이터가 깨지는 사고. 재현이 안 돼 디버깅에 1주 소요.

**진단:**
- 스택 pop 중 스레드 A가 top 노드(=A)를 읽음 → 잠시 멈춤
- 그 사이 다른 스레드가 A를 pop → 풀에 반납 → *재사용해서 다시 push* (top이 다시 A)
- A가 깨어나 `CAS(top, A, A.next)` 성공 → 하지만 *A.next는 이미 바뀐 값* → 깨짐
- GC가 있어도 *객체 풀 재사용* 때문에 ABA가 발생

**조치:**
- `AtomicReference` → **`AtomicStampedReference`** 로 교체
- 노드 참조에 *버전 스탬프*를 함께 묶어 CAS → A→B→A라도 *스탬프가 달라* 실패 처리

**결과:**
- ABA로 인한 데이터 깨짐 0건
- 객체 풀 재사용은 유지하면서 안전성 확보

**교훈:** "자바는 GC가 있어서 ABA 안전"은 **객체 풀·재사용 패턴에선 거짓**이다. 풀로 노드를 재사용하면 ABA가 부활한다. `AtomicStampedReference`로 **버전 태깅**을 하면 값이 같아도 스탬프로 구분된다.

</details>

### 🔄 꼬리질문 3: 경합이 심해지면 어떤 운영 신호를 봐야 하나요?

**기대 답변:**
- **CAS retry 비율**: `casSuccess / casAttempts`가 0.5 미만이면 위험
- **CPU 100%인데 throughput 감소**: 스핀 폭주 신호
- **컨텍스트 스위치 폭증**: OS가 스핀을 깨고 있다는 뜻

대응으로 adaptive spinning이나 `LongAdder` 같은 striping으로 핫 키 자체를 분산합니다.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 광고 클릭 카운터가 캠페인 시작 직후 *CPU 95%인데 처리량은 오히려 떨어지는* 이상 현상. "CPU를 쓰는데 일을 안 하는" 상태.

**진단 — 세 지표 조합:**
- **CPU 95% + throughput 감소**: CPU를 *스핀(CAS retry)에 태우고* 있다는 신호
- `vmstat`의 **context-switch가 평소 8천 → 3.4만/s 폭증**: OS가 스핀하는 스레드를 강제로 깨우는 중
- 애플리케이션 메트릭에서 **CAS retry 비율 78%** (성공보다 실패가 많음)

**조치:**
- 단일 핫 키 `AtomicLong` → `LongAdder`로 striping (경합 자체를 여러 cell로 분산)
- 또는 *짧은 스핀 후 백오프*하는 adaptive 전략 고려

**결과:**
- CPU 95% → 35%, throughput 3.5배
- context-switch·retry 비율 정상화

**교훈:** 경합 진단은 *한 지표로는 안 된다*. **CPU vs throughput 곡선(역전) + context-switch 폭증 + CAS retry 비율** 을 조합해서 봐야 "스핀 폭주"를 식별할 수 있다. 해법은 보통 *경합 자체를 striping으로 분산*하는 것.

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
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 실시간 집계 모듈에서 `volatile long counter`를 두고 `counter++`로 카운트했는데, 부하 테스트에서 *총합이 실제 이벤트 수보다 적게* 집계됨 (누락).

**진단:**
- `counter++`는 사실 **read → modify → write 3단계** (원자적이지 않음)
- `volatile`은 *각 read/write의 가시성*만 보장할 뿐, 세 단계 사이에 다른 스레드가 끼어드는 *lost update*는 못 막음
- 두 스레드가 동시에 같은 값을 읽고 +1 → 한 번의 증가만 반영

**조치:**
- `volatile long` → **`AtomicLong` / `LongAdder`** 로 교체
- read-modify-write를 *원자적 CAS*로 처리

**결과:**
- 집계 누락 0건
- (고경합이라 최종적으로 `LongAdder`로 striping까지 적용)

**교훈:** `volatile`은 *단일 read 또는 단일 write의 가시성*만 보장한다. **복합 연산(`++`, check-then-act)은 보호하지 못한다.** 원자성이 필요하면 `synchronized` 또는 `Atomic*`을 써야 한다. "가시성"과 "원자성"은 다른 문제.

</details>

### 🔄 꼬리질문 2: 컴파일러 재정렬이 문제가 되는 케이스는?

**기대 답변:**
대표적으로 **double-checked locking** 버그입니다. `instance = new Resource()`에서 *참조 대입*이 *생성자 완료*보다 먼저 보이면 다른 스레드가 미초기화 객체를 받습니다.

해결: 필드에 `volatile` 추가, 또는 static holder 패턴(클래스 초기화의 happens-before)을 사용.

x86은 정렬이 강해 안 보이지만, ARM/PowerPC에선 실측에서 잡힙니다.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** x86 인스턴스에서 *수년간 멀쩡하던* 싱글톤 초기화 코드가, 비용 절감으로 일부 워크로드를 **ARM 기반 Graviton 인스턴스**로 옮기자 *매일 수천 건 NPE*가 발생.

**진단:**
- 문제의 DCL 코드에 `volatile`이 누락되어 있었음
- x86은 *store-store 재정렬이 거의 없어* 참조 대입이 생성자 완료보다 먼저 보일 일이 사실상 없었음 (그래서 수년간 안 터짐)
- ARM은 *weak memory model* → 재정렬이 실제로 발생 → 다른 스레드가 *초기화 안 된 객체* 참조 → NPE

**조치:**
- 싱글톤 필드에 `volatile` 추가 (또는 Static Holder 패턴으로 전환)
- 멀티 아키텍처 환경 가정하에 *동시성 코드 전수 점검*

**결과:**
- ARM 인스턴스 NPE 0건
- 이후 동시성 코드는 *weak memory model 가정*으로 작성

**교훈:** "x86에서 잘 돌았으니 안전"은 거짓이다. **재정렬은 CPU 아키텍처마다 다르고, ARM/PowerPC는 약한 메모리 모델**이라 x86에서 숨어있던 버그가 드러난다. 멀티 아키텍처 시대엔 *재정렬을 명시적으로 막는 코드*(volatile/적절한 동기화)가 필수.

</details>

### 🔄 꼬리질문 3: 다른 언어 메모리 모델과 비교하면?

**기대 답변:**
- **Go**: 채널·`sync.Mutex`가 happens-before. `sync/atomic`이 release/acquire 노출
- **Rust**: 컴파일 타임에 데이터 레이스 차단. `Send`/`Sync` trait
- **C++**: `std::memory_order`로 가장 세밀한 제어. 자바 `volatile`은 C++ `seq_cst`에 가까움

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 일부 고성능 모듈을 Java → Go로 마이그레이션. 자바 `volatile` 감각으로 *공유 맵을 여러 goroutine이 동시에 읽고 씀*. 테스트는 통과했는데 운영에서 *간헐적 panic(concurrent map read and write)*.

**진단:**
- Go는 *공유 메모리 동기화를 언어가 강제하지 않음* (자바 `volatile` 같은 필드 한정자가 없음)
- 공유 맵 동시 접근은 *데이터 레이스* → Go 런타임이 감지하면 panic
- `go test -race`(레이스 디텍터)를 CI에 안 돌려서 사전에 못 잡음

**조치:**
- 공유 맵을 `sync.Map` 또는 `sync.RWMutex`로 보호
- *채널*로 소유권을 넘기는 Go 관용구로 일부 재설계 ("Don't communicate by sharing memory; share memory by communicating")
- CI에 **`go test -race`** 추가

**결과:**
- 동시성 panic 0건
- 레이스 디텍터가 이후 유사 버그를 빌드 단계에서 차단

**교훈:** 언어마다 *기본 안전 가정과 동기화 관용구가 다르다*. 자바의 `volatile`·`synchronized` 감각으로 Go·Rust·C++ 코드를 쓰면 깨진다. 코드를 옮길 땐 **그 언어의 메모리 모델·레이스 도구(`go test -race`, Rust borrow checker)** 부터 익힌다.

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
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** Virtual Thread를 도입했는데 기대했던 5배가 아니라 *1.5배밖에* throughput이 안 늘어 의아했음. "Loom 효과가 별로네"라는 분위기.

**진단 — JFR Pinning 이벤트:**
- `-XX:+FlightRecorder`로 **`jdk.VirtualThreadPinned`** 이벤트를 수집
- stack을 보니 외부 HTTP 클라이언트(레거시 라이브러리)가 *내부적으로 `synchronized` 블록 안에서 socket I/O*
- 가상 스레드가 그 블록에서 *캐리어 OS 스레드에 pin*되어 unmount 못 함 → 캐리어 풀(코어 수)만큼만 동시 처리 → Loom 이점 상실

**조치:**
- 해당 HTTP 클라이언트를 *`ReentrantLock` 기반* 또는 pin 없는 최신 버전으로 교체
- JFR pinning 이벤트를 *상시 모니터링 대시보드*에 추가

**결과:**
- pin 제거 후 throughput 1.5배 → 5배 (기대치 도달)
- 이후 라이브러리 도입 시 *pinning 여부를 체크리스트화*

**교훈:** Virtual Thread가 기대만큼 안 빠르면 거의 **Pinning** 때문이다. `synchronized` 블록 내 blocking I/O가 캐리어를 묶는다. **JFR `jdk.VirtualThreadPinned` 진단 없이는 Loom이 반쪽**이다. `ReentrantLock`으로 바꾸면 unmount된다.

</details>

### 🔄 꼬리질문 2: 기존 스레드 풀 코드를 마이그레이션할 때 주의점은?

**기대 답변:**
- 풀 사이즈 튜닝이 사라지고, **세마포어로 동시성 상한**을 거는 패턴으로 바뀜
- `ThreadLocal`은 메모리 부담이 커짐 → JDK 21 **Scoped Values** 검토
- 일부 APM이 Virtual Thread를 OS 스레드로 잘못 집계 → 에이전트 버전 확인

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 스레드 풀 → Virtual Thread 전환 직후, *모니터링 알람이 폭주*. "동시 스레드 5만 개" 같은 비정상 수치가 뜨고 APM이 *DB 커넥션 풀 고갈* 오탐.

**진단:**
- **APM(Datadog) 에이전트 구버전**이 가상 스레드를 *각각 OS 스레드로 집계* → 동시 스레드 수가 50배 부풀려짐
- 진짜 문제: DB 커넥션 풀(50개)이 상한인데, 가상 스레드를 *무제한*으로 띄워 5만 개가 *커넥션 50개를 두고 대기* → 풀 고갈 알람

**조치:**
- APM 에이전트를 *Virtual Thread 지원 버전*으로 업그레이드
- DB 호출 앞에 **`Semaphore(50)`** 로 동시성 상한 (커넥션 풀 크기와 일치) → 풀 고갈 방지
- "풀 사이즈 튜닝" 사고방식을 "세마포어로 자원별 상한" 사고방식으로 전환

**결과:**
- 모니터링 수치 정상화, 오탐 알람 소멸
- 커넥션 풀 고갈 없이 안정 운영

**교훈:** Virtual Thread 전환은 *코드만의 문제가 아니다*. **(1) 모니터링 도구 호환성(에이전트 버전), (2) 외부 자원은 세마포어로 상한**을 반드시 챙겨야 한다. 가상 스레드는 무한히 만들 수 있어서 *오히려 외부 자원(DB 커넥션)을 고갈*시키기 쉽다.

</details>

### 🔄 꼬리질문 3: Reactive(WebFlux) vs Virtual Thread, 어느 쪽?

**기대 답변:**
- 팀 친숙도가 동기 스타일이면 Loom
- 사용 중인 드라이버가 blocking-friendly (JDBC) → Loom, R2DBC 같은 reactive → 그대로
- 백프레셔·스트리밍이 핵심이면 Reactive
- 수십만 동시 연결 메모리 효율이면 Reactive

신규는 Loom, 잘 도는 Reactive는 유지가 합리적입니다.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 회사에 *WebFlux로 잘 돌고 있는 결제 모듈*과 *새로 만들 추천 모듈*이 있었음. "통일하자"며 추천도 WebFlux로 가자는 의견과 Loom으로 가자는 의견이 충돌.

**판단 기준 적용:**
- **결제 모듈(기존 WebFlux)**: 이미 reactive 체인이 안정적이고 R2DBC 드라이버·백프레셔를 활용 중 → *건드리지 않고 유지* (재작성 리스크 > 통일 이득)
- **추천 모듈(신규)**: 팀 대다수가 *동기 스타일에 익숙*하고, 추천 데이터 소스가 *JDBC 기반*(blocking) → **Loom 채택**. callback 없이 동기 코드로 작성 → 가독성·디버깅 우수

**결과:**
- 두 패러다임을 *도메인별로 공존* 운영 (1년간 문제 없음)
- 추천 모듈은 Loom으로 빠르게 개발 (학습 비용 낮음)
- 결제는 WebFlux 그대로 안정 운영

**교훈:** "하나로 통일"이 항상 정답은 아니다. **잘 도는 Reactive는 유지, 신규는 팀 친숙도·드라이버 특성에 맞춰 Loom** — 도메인별 적합성으로 선택한다. 백프레셔·스트리밍·수십만 동시연결이 핵심이면 Reactive, 단순 요청-응답 + 동기 친숙도면 Loom.

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
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 여러 테이블(order, inventory, coupon)을 락 거는 주문 처리에서, *코드 위치마다 락 순서가 제각각*이라 평소엔 괜찮다가 트래픽 피크 때 데드락이 폭증. 처음엔 `lock_timeout`만 짧게 잡아 *재시도로 때웠으나* 피크 때 재시도 폭주로 처리량 급락.

**진단:**
- 타임아웃 + 재시도는 *데드락을 숨길 뿐 제거 못 함* → 피크 때 데드락 빈도 ↑ → 재시도 ↑ → 부하 ↑ 악순환
- 근본 원인은 *락 획득 순서 불일치* (A→B 어딘가, B→A 다른 어딘가)

**조치 — 순서 정렬을 컨벤션으로:**
- 모든 다중 테이블 락을 *항상 동일한 순서*(테이블명 alphabetical, 같은 테이블 내 PK 오름차순)로 강제
- ArchUnit/리뷰 체크리스트로 *순서 위반 패턴* 탐지
- `lock_timeout`은 *제거가 아니라 최후 안전망*으로만 유지

**결과:**
- 데드락 0건 (피크 포함)
- 재시도 폭주·처리량 급락 소멸

**교훈:** 타임아웃·재시도는 데드락을 *숨길 뿐* 제거하지 못한다 — 피크 때 폭증한다. **자원 순서 정렬이 근본 해결**이고, 신규 코드도 안전하려면 *순서를 컨벤션·자동 검사로 강제*해야 한다. 타임아웃은 그 위의 안전망일 뿐.

</details>

### 🔄 꼬리질문 2: DB 데드락과 애플리케이션 데드락은 어떻게 구분하나요?

**기대 답변:**
- **DB**: DB가 한쪽을 victim으로 자동 abort, `DeadlockException` 발생, DB의 `deadlocks` 카운터로 추적
- **앱**: 자동 해제 없음, 요청 hang, CPU 0%인데 throughput drop, jstack으로 추적

DB는 인덱스 부재의 gap lock 확장, 앱은 외부 호출 → 자기 호출 같은 콜백 사이클이 흔합니다.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 배치 작업이 어느 순간 *완전히 멈춤*. DB의 `deadlocks` 카운터는 0인데 작업이 진행 안 됨. "DB 데드락은 아닌데 멈춰있다"는 혼란.

**진단 — 증상으로 구분:**
- DB 데드락이면 *한쪽이 자동 abort + `DeadlockException`* 떠야 하는데 없음 → DB 아님
- **CPU 0%인데 throughput 0** + 요청 hang → *애플리케이션 데드락* 의심
- `jstack <pid>`로 thread dump → **`Found Java-level deadlock`** 섹션 발견
- 배치 스레드와 실시간 요청 스레드가 *서로 다른 두 `synchronized` 모니터를* 역순으로 잡아 순환 대기

**조치:**
- 두 모니터 획득 순서를 통일 (자원 순서 정렬)
- 일부는 `synchronized` → `ReentrantLock(tryLock + timeout)`으로 교체해 *자동 해제 안 되는* 영구 hang 방지
- liveness probe에 *jstack 자동 캡처 + 재시작* 추가

**결과:**
- 배치 hang 0건
- 재발 시에도 자동 thread dump로 즉시 진단 가능

**교훈:** **DB 데드락은 자동 abort(예외)되지만, 애플리케이션 데드락은 자동 해제가 안 돼 영구 hang**된다. 구분 신호는 *`deadlocks` 카운터·예외 유무*와 *CPU 0%인데 throughput drop*이다. 앱 데드락은 jstack의 "Found Java-level deadlock"으로 잡고, *자동 thread dump*를 걸어둔다.

</details>

### 🔄 꼬리질문 3: 데드락 모니터링을 자동화한다면?

**기대 답변:**
3단 알람:
1. **Warning**: lock wait p99 > 1초
2. **Critical**: DB `deadlocks` 카운터 delta, 앱은 락 ID×스레드 ID cycle 탐지
3. **자동 복구**: 재시도(jitter backoff), 임계 초과 시 k8s liveness probe로 컨테이너 재시작 + `jstack` snapshot을 S3 업로드

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 애플리케이션 데드락이 *새벽에 발생*하면 운영자가 깨서 들어올 때쯤엔 *이미 hang 상태가 한참 지속*. 게다가 재시작하면 *증거(thread dump)가 사라져* RCA가 불가능. 같은 데드락이 한 달에 두세 번 반복되는데 원인을 못 잡음.

**조치 — 증거 보존 + 자동 복구:**
- **Warning 단계**: lock wait p99 > 1초 알람 (데드락 전조)
- **Critical 단계**: liveness probe가 hang 감지
- **자동 복구 시퀀스**:
  1. 재시작 *직전*에 `jstack` snapshot을 자동 캡처해 **S3에 업로드**
  2. 그 다음 컨테이너 재시작 (서비스 즉시 복구)
  3. Slack에 snapshot 링크 + 알람

**결과:**
- 데드락 발생 시 *서비스는 2분 내 자동 복구* (운영자 개입 전)
- *모든 발생의 thread dump가 S3에 보존* → 다음 날 RCA로 근본 원인(특정 모니터 역순 획득) 발견·수정
- 이후 재발 0건

**교훈:** 데드락 자동화의 핵심은 *복구*뿐 아니라 **증거 보존**이다. 그냥 재시작하면 *원인을 영영 못 잡는다*. **재시작 직전 jstack을 자동 캡처해 외부 저장소(S3)에 올리고 → 재시작**하는 시퀀스가 "빠른 복구 + 사후 RCA 가능"을 동시에 달성한다.

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
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 재고 차감에 낙관적 락(`@Version`)을 적용. 평소엔 *충돌율 3%* 로 완벽히 동작. 그런데 *플래그십 상품 프로모션 시작 1분간*만 같은 상품에 요청이 집중되어 충돌율 95%로 치솟고, retry 폭주로 DB CPU 90% + p99 급등.

**진단:**
- 충돌율을 *평균*으로만 모니터링해서 평소 3%만 보고 안심
- 실제로는 *피크 1분간 95%* — 그 짧은 구간이 장애를 만듦
- p99 응답시간이 평균보다 크게 튀는 게 *충돌 누적 신호*였음

**조치 — 핫 키만 선별 격리:**
- 전체를 바꾸지 않고 *프로모션 핫 상품의 재고 차감만* Redis Lua(원자적 DECR)로 분리
- 일반 상품은 기존 낙관적 락 유지 (충돌율 낮아 효율적)
- 충돌율을 *평균이 아니라 피크(분 단위 max)* 로 모니터링하도록 대시보드 변경

**결과:**
- 프로모션 핫 상품 충돌·retry 폭주 소멸
- 일반 상품은 불필요한 인프라 추가 없이 유지

**교훈:** 낙관적 락의 sweet spot은 *충돌율 5~20%*. **충돌율은 평균이 아니라 피크(분 단위)로 봐야 한다** — 짧은 피크가 장애를 만든다. 30% 넘는 핫 키만 *선별적으로* Redis Lua·샤딩·큐 직렬화로 격리하는 게 비용 효율적이다.

</details>

### 🔄 꼬리질문 2: 재시도를 다 소진하고도 실패하면?

**기대 답변:**
- 결제·예약: 즉시 실패 + 명확한 메시지 (silent retry 금지)
- 카운터·집계: 비동기 큐로 eventual consistency, DLQ 백업
- 알림: 워커 큐 재전송, 24시간 후 운영 알람

**멱등키**를 함께 설계해야 클라이언트 재시도에도 한 번만 처리됩니다.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 공연 좌석 예약에서 낙관적 락 재시도 5회를 다 소진하면 *사용자에게 즉시 실패 에러*를 던졌음. 인기 공연 오픈 순간엔 *수많은 사용자가 에러 화면*을 보고 이탈, CS 문의 폭주.

**진단:**
- 재시도 소진을 *"에러"* 로만 처리 → 사용자 경험 최악
- 하지만 좌석은 *비관적 락으로 직렬화하면* 처리량이 죽음 (딜레마)

**조치 — 실패를 다른 UX 흐름으로:**
- 재시도 소진 시 에러 대신 **비동기 예약 큐로 전환** + 사용자에겐 *"예약 처리 중, 잠시만요"* 화면
- 큐에서 순차 처리 후 *5초 내 결과를 push/폴링*으로 전달 (성공/매진)
- 멱등키로 *사용자 중복 요청은 한 건으로* 합침

**결과:**
- 좌석 예약 이탈률 8% → 1.5%
- CS 문의 급감 (에러 화면 대신 "처리 중" 안내)

**교훈:** 재시도 소진은 *"에러"가 아니라 "다른 처리 흐름의 시작"* 으로 다뤄야 한다. 도메인에 따라 **비동기 큐 전환 + 진행 상태 안내**가 즉시 에러보다 훨씬 낫다. 단, 멱등키로 *중복 요청을 한 건으로* 합쳐야 큐가 안전하다.

</details>

### 🔄 꼬리질문 3: AOP 기반 재시도(`@Retryable`)의 한계는?

**기대 답변:**
- **자가 호출 문제**: 프록시를 안 거쳐 동작 안 함 → 빈 분리 또는 AspectJ
- **트랜잭션 경계 어긋남**: `@Transactional` 안에서 재시도하면 락이 안 풀림 → 트랜잭션 밖에서 재시도
- **재시도 가능 예외 식별**: 비즈니스 에러까지 반복 금지 — 락 관련 예외만 선별
- **관찰성**: Micrometer `retry.calls` 메트릭으로 충돌율 모니터링

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 낙관적 락 충돌에 `@Retryable`을 붙였는데 *재시도가 전혀 동작하지 않고* 첫 충돌에서 바로 실패. 로그엔 재시도 흔적도 없음.

**진단 — Spring AOP 프록시 한계:**
- 문제 코드가 *같은 클래스 내 메서드를 직접 호출*(self-invocation)
- `@Retryable`/`@Transactional`은 *프록시*를 통해야 동작하는데, 같은 객체 내부 호출은 *프록시를 거치지 않음* → 어노테이션 무력화
- 게다가 `@Retryable`이 `@Transactional` 메서드 *안쪽*에 있어, 재시도해도 *트랜잭션이 안 풀려* 충돌이 그대로 재발할 구조였음

**조치:**
- 재시도 대상 메서드를 *별도 빈으로 분리* → 프록시를 거치게 함
- 트랜잭션 경계를 *재시도 바깥*으로 (재시도 → 매번 새 트랜잭션 시작)
- 재시도 가능 예외를 *락 관련(`ObjectOptimisticLockingFailureException`)만* 명시 (비즈니스 예외는 재시도 안 함)
- Micrometer `retry.calls` 메트릭으로 충돌율 가시화

**결과:**
- 재시도 정상 동작 (충돌 시 매번 fresh 트랜잭션으로 재시도)
- 비즈니스 에러는 즉시 실패 (불필요한 반복 제거)

**교훈:** `@Retryable`은 편하지만 **(1) self-invocation은 프록시를 안 거쳐 무력화, (2) 트랜잭션 안에서 재시도하면 락이 안 풀려 무의미, (3) 모든 예외 재시도는 비즈니스 에러까지 반복** 한다. *빈 분리 + 트랜잭션 경계 바깥 재시도 + 예외 선별*이 필수다.

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
