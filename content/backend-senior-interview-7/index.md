---
layout: post
emoji: 🗄️
title: "시니어 백엔드 면접 질문 7편 - DB/일관성 운영 (5~10년차)"
date: '2026-06-09 12:20:00'
author: 손(Son/손민기)
tags: 백엔드 면접 시니어 DB 인덱스 격리수준 WriteAmplification RLS PostgreSQL 쿼리플랜 JPA N+1 꼬리질문
categories: CS
series: "시니어 백엔드 면접 질문"
---

7편은 **DB와 일관성 운영**입니다. 면접관은 SQL 문법보다 **운영 중 무엇이 망가졌고 어떻게 복구했는지**를 봅니다.

**시리즈 구성:**
- 1~6편 (이전): 인프라 / 운영 / 설계 / 동시성 / 분산 / 가용성
- **7편 (현재)**: DB/일관성 운영
- 8편 (예정): 플랫폼/배포
- 9편 (예정): 네트워크/보안

---

## 1. Index Cardinality와 복합 인덱스

### Q1. 인덱스를 추가했는데 옵티마이저가 풀스캔을 고르는 이유는?

**기대 답변:**
**선택도(Selectivity)** 가 낮아서입니다.
- 인덱스가 가리키는 행 수가 전체의 일정 비율(보통 10~30%) 이상이면 풀스캔이 더 쌉니다
- 통계가 오래돼 옵티마이저가 행 수를 잘못 추정
- 함수·형변환이 들어가 인덱스를 못 탐

기준은 인덱스 유무가 아니라 **카디널리티 + 통계 신선도 + 쿼리 형태**입니다.

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 사용자 알림 조회 API가 평소 50ms → 갑자기 12초. 인덱스는 있고 데이터 양도 큰 변동 없음.

**진단:**
```sql
EXPLAIN ANALYZE
SELECT * FROM notifications
WHERE user_id = 12345 AND status = 'UNREAD'
ORDER BY created_at DESC LIMIT 20;

-- 결과:
-- Seq Scan on notifications (cost=0..1500000 rows=20)
--   Filter: (user_id=12345 AND status='UNREAD')
--   Rows Removed by Filter: 18,300,000
```
- 인덱스 `(user_id, status, created_at)` 분명 존재
- 그런데 풀스캔 선택. 옵티마이저가 *user_id=12345 매칭 row 20만 건*으로 추정 (실제 80건)

**근본 원인 — 통계 stale:**
```sql
SELECT relname, last_autovacuum, n_live_tup, n_dead_tup
FROM pg_stat_user_tables WHERE relname='notifications';

-- last_autovacuum: 한 달 전
-- n_dead_tup: 2,500만 (n_live_tup 1,800만)
```
- 대량 INSERT/UPDATE 후 autovacuum 임계치 미도달
- 통계가 *너무 옛것*이라 옵티마이저가 인덱스 선택도를 오판

**조치:**
```sql
ANALYZE notifications;  -- 즉시 통계 재수집
ALTER TABLE notifications SET (
  autovacuum_analyze_scale_factor = 0.05  -- 기본 0.1 → 0.05
);
```

**결과:**
- 같은 쿼리 50ms 복귀
- 1주일 모니터링 — 동일 현상 재발 없음

**더 안 들키게 — Extended Statistics:**
- `user_id`와 `status`가 *상관관계*가 있는 경우 단변량 통계로는 부족
- `CREATE STATISTICS s_noti ON user_id, status FROM notifications`

**교훈:**
- *인덱스 있는데 풀스캔* = 거의 항상 **통계 stale**
- 운영에서 `pg_stat_user_tables` last_analyze 모니터링 필수
- 핫 테이블은 `autovacuum_analyze_scale_factor`를 *기본보다 공격적으로*

</details>

### 🔄 꼬리질문 1: 복합 인덱스 컬럼 순서는 어떻게 정하나요?

**기대 답변:**
- **선택도 높은 컬럼을 앞에** 두어 검색 범위를 빨리 좁힘
- 등치 조건(=)이 범위 조건(<, >, BETWEEN)보다 앞
- ORDER BY와 조합되면 정렬 컬럼도 인덱스 마지막에

`(A=, B=, C BETWEEN)` 순서가 안정적입니다.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 주문 조회 쿼리(`WHERE status='ACTIVE' AND created_at > '...' ORDER BY created_at DESC`)에 `(created_at, status)` 인덱스가 있었는데 *풀스캔*으로 3.2초.

**진단:**
- 인덱스 선두가 `created_at`(범위 조건) → 등치 조건 `status`가 인덱스를 효율적으로 못 좁힘
- `EXPLAIN`상 `created_at` 범위로 넓게 스캔 후 `status`로 필터 → 비효율

**조치 — 컬럼 순서 재배치:**
- `(created_at, status)` → **`(status, created_at DESC)`**
- 등치 조건(`status`)을 선두에 → 즉시 좁힌 후 `created_at`은 *범위 + 정렬*을 동시 해결 (filesort도 제거)
- 기존 인덱스는 *1주 모니터링 후* drop (다른 쿼리 회귀 방지)

**결과:**
- 3.2초 → 45ms
- `Using filesort`도 제거 (정렬 컬럼이 인덱스에 정렬돼 있어서)

**교훈:** 복합 인덱스는 **등치 조건 컬럼을 선두, 범위·정렬 컬럼을 뒤**(`A=, B=, C BETWEEN/ORDER BY`)에 둔다. 범위 컬럼이 선두면 *그 뒤 컬럼들이 인덱스를 효율적으로 못 쓴다*. 정렬 컬럼을 인덱스 끝에 두면 filesort도 같이 제거된다.

</details>

### 🔄 꼬리질문 2: 커버링 인덱스가 항상 좋은 건가요?

**기대 답변:**
아닙니다.
- 인덱스 크기가 커져 쓰기·캐시 비용 증가
- 메모리 효율성 저하 (버퍼 풀에 더 적게 들어감)
- 컬럼 변경 시 인덱스 재구성 비용

자주 쓰이는 조회만 선별적으로 커버링.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 조회 성능을 위해 *여러 테이블에 커버링 인덱스를 광범위하게* 추가(`INCLUDE`에 컬럼 다수). 조회는 빨라졌으나 *쓰기 latency가 2배*가 되고, 버퍼 풀 적중률이 떨어져 *오히려 다른 쿼리들이 느려짐*.

**진단:**
- 커버링 인덱스가 *INCLUDE 컬럼만큼 인덱스 크기를 키움* → INSERT/UPDATE마다 *큰 인덱스 갱신* 비용
- 인덱스가 커지니 *버퍼 풀에 들어갈 데이터·인덱스 페이지가 줄어* 적중률 하락
- write-heavy 테이블에 광범위 커버링 → 손해

**조치 — 선별 적용:**
- *읽기 빈도가 압도적으로 높고 쓰기가 적은* 소수 쿼리만 커버링 유지
- write-heavy 테이블의 커버링 인덱스는 *INCLUDE 컬럼 최소화* 또는 제거
- 쓰기 latency·버퍼 풀 적중률을 적용 전후로 비교

**결과:**
- 쓰기 latency 정상화, 버퍼 풀 적중률 회복
- 진짜 핫한 읽기 쿼리만 커버링 이득 유지

**교훈:** 커버링 인덱스는 *공짜가 아니다* — **인덱스 크기 증가 → 쓰기 비용 + 버퍼 풀 압박**. 무분별하게 INCLUDE를 늘리면 *읽기 이득보다 쓰기·메모리 손해*가 크다. **읽기 핫 + 쓰기 적은 소수 쿼리에만 선별** 적용한다.

</details>

### 🔄 꼬리질문 3: JPA N+1과 인덱스의 관계는?

**기대 답변:**
N+1은 *쿼리 횟수* 문제지만 인덱스가 없으면 N개의 풀스캔이 폭주합니다.
- ToOne 관계는 페치 조인으로 1쿼리화
- ToMany는 `default_batch_fetch_size`로 IN 쿼리 (카르테시안 곱 회피)
- FK 컬럼 인덱스는 기본으로 보장

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 주문 목록(100건) 조회 시 각 주문의 `order.user`를 lazy 로딩 → *100번의 추가 SELECT*(N+1). 게다가 `orders.user_id` FK에 *인덱스가 없어* 각 SELECT가 풀스캔 → 100번의 풀스캔으로 응답 8초.

**진단:**
- N+1: 주문 1쿼리 + 사용자 100쿼리 = 101쿼리
- *결정타*: `user_id` FK 인덱스 부재 → 각 사용자 조회가 *수백만 행 풀스캔* (N+1이 풀스캔 폭주로 증폭)

**조치 — 쿼리 횟수 + 인덱스 동시 해결:**
- ToOne(`order.user`)은 *페치 조인*으로 1쿼리화 (`JOIN FETCH`)
- ToMany 컬렉션은 `default_batch_fetch_size`로 IN 쿼리 (카르테시안 곱 회피)
- *FK 컬럼(`user_id`)에 인덱스 추가* (PG는 FK에 자동 인덱스 안 만듦)

**결과:**
- 101쿼리 → 1~2쿼리, 각 쿼리도 인덱스 스캔
- 응답 8초 → 60ms

**교훈:** N+1은 *쿼리 횟수* 문제지만, **FK 인덱스가 없으면 N번의 풀스캔으로 증폭**되어 훨씬 치명적이다. ToOne은 페치 조인, ToMany는 batch fetch로 횟수를 줄이고, **FK 컬럼 인덱스(PG는 자동 생성 안 함)** 를 반드시 보장한다.

</details>

---

## 2. Read Committed vs Repeatable Read

### Q2. 두 격리 수준의 실제 차이를 시나리오로 설명해주세요.

**기대 답변:**
- **Read Committed**: 매 쿼리 시점의 커밋된 데이터를 본다. 같은 쿼리를 두 번 하면 결과가 달라질 수 있음 (Non-repeatable Read)
- **Repeatable Read**: 트랜잭션 시작 시점의 스냅샷을 끝까지 유지. 단 PostgreSQL은 *완전한 직렬화*까지는 아님

MySQL/InnoDB의 기본은 RR, PostgreSQL의 기본은 RC.

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 잔액 조회 + 출금 API. *동시 출금 2건* 발생 시 음수 잔액 사고.

**문제 코드 (Read Committed):**
```kotlin
@Transactional  // PG 기본 RC
fun withdraw(accountId: Long, amount: BigDecimal) {
  val account = accountRepo.findById(accountId)  // (1) balance = 100
  if (account.balance < amount) throw InsufficientException()
  account.balance -= amount  // (2) 90으로 update
  accountRepo.save(account)
}
```

**동시 실행 — Race Condition:**
```
T1: SELECT (balance=100)
T2: SELECT (balance=100)  // T1 커밋 전이라 100 보임
T1: UPDATE (balance=90), COMMIT
T2: UPDATE (balance=90), COMMIT  // 80이어야 하는데 90으로 덮음
```
- 둘 다 잔액 검증 통과 → 음수 잔액 가능

**해결 옵션 비교:**

**옵션 1 — Repeatable Read로 격리 수준 상향:**
```kotlin
@Transactional(isolation = Isolation.REPEATABLE_READ)
fun withdraw(...) { ... }
```
- PG에서 두 번째 트랜잭션이 `could not serialize access` 예외
- 재시도 로직 필요 → 코드 복잡

**옵션 2 — 비관적 락 (`SELECT FOR UPDATE`):**
```kotlin
val account = accountRepo.findByIdForUpdate(accountId)  // 락
```
- 순차 처리, 직관적
- 처리량 저하

**옵션 3 — 낙관적 락 + `@Version`:**
```kotlin
@Entity class Account { @Version var version: Long = 0 }
```
- 충돌 시 예외 → 재시도
- 충돌 빈도 낮을 때 효율적

**옵션 4 — 원자적 UPDATE (선택한 해결):**
```kotlin
@Modifying
@Query("UPDATE Account a SET a.balance = a.balance - :amount " +
       "WHERE a.id = :id AND a.balance >= :amount")
fun withdrawAtomic(id: Long, amount: BigDecimal): Int  // updated row count
```
- DB 단일 statement로 검증 + 차감
- updated count = 0 이면 잔액 부족 처리
- 락 없음, 격리 수준 불문 안전

**결과:**
- 음수 잔액 사고 0건
- 처리량 비관적 락 대비 4배

**교훈:**
- *Read Committed로도 충분*한 케이스가 많음 — **원자적 UPDATE**가 정석
- 격리 수준 상향은 *비용 대비 효과* 따져야 함
- 동시성 제어는 격리 수준 외에도 *쿼리 패턴 자체*가 중요

</details>

### 🔄 꼬리질문 1: Phantom Read는 RR에서도 발생하나요?

**기대 답변:**
- MySQL/InnoDB: gap lock으로 막힘 (사실상 SERIALIZABLE 근접)
- PostgreSQL: RR(엄밀히 snapshot isolation)이라 phantom은 막지만 *write skew*는 발생 → 필요 시 SERIALIZABLE

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 병원 *온콜 스케줄* 시스템 — "응급실에 최소 1명은 남아야 한다"는 규칙. PostgreSQL RR(snapshot isolation)을 믿고 있었는데, *두 의사가 동시에 휴가 신청*하자 *둘 다 "나 말고 1명 더 있네"를 보고 둘 다 승인* → **응급실에 0명** 사고.

**진단 — Write Skew:**
- PG RR은 *각자 트랜잭션 시작 시점 스냅샷*을 봄 → 둘 다 "남은 의사 2명" 스냅샷
- 각자 자기만 빠지는 UPDATE → *서로의 변경을 못 봄* → 둘 다 통과
- Phantom은 막지만 *write skew*(서로 다른 row를 수정해 불변식 위반)는 RR에서 발생

**조치:**
- 해당 트랜잭션만 **`SERIALIZABLE`** 격리로 상향 → PG가 *직렬화 이상 감지 시 한쪽을 abort*
- abort된 쪽은 *재시도* (이번엔 "1명만 남음" 보고 거부)

**결과:**
- "응급실 0명" 사고 0건
- SERIALIZABLE은 해당 핵심 트랜잭션에만 한정 (전체 성능 영향 최소화)

**교훈:** PostgreSQL RR은 *엄밀히 snapshot isolation*이라 **Phantom은 막아도 write skew(불변식 위반)는 발생**한다. "최소 N명 유지" 같은 *집합 불변식*이 걸린 트랜잭션은 *SERIALIZABLE + 재시도*가 필요하다. MySQL/InnoDB는 gap lock으로 더 강하게 막는 차이도 알아둔다.

</details>

### 🔄 꼬리질문 2: MVCC가 어떻게 격리 수준을 보장하나요?

**기대 답변:**
- 각 행이 버전(`xmin`/`xmax`)을 가짐
- 트랜잭션은 자기 시점의 visible 버전만 봄
- 읽기와 쓰기가 서로 블로킹하지 않음 (락 vs 락 충돌만 발생)

비용은 **Undo/Old version 누적** → vacuum/cleanup 필요.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 분석팀의 *1시간짜리 무거운 리포트 쿼리*가 OLTP DB에서 돌기 시작한 뒤, 무관한 주문 테이블 쿼리들이 전부 느려지고 디스크 사용량이 급증.

**진단 — Long Transaction이 vacuum을 막음:**
- MVCC는 *Old version(이전 버전 row)* 을 보관 → 트랜잭션들이 자기 시점 버전을 봄
- 1시간 트랜잭션이 *살아있는 동안* vacuum이 *그 시점 이후 dead tuple을 정리 못 함* (혹시 그 트랜잭션이 볼 수 있어서)
- dead tuple이 계속 쌓여 *테이블 bloat* → 인덱스·스캔 효율 급락

**조치:**
- 무거운 분석 쿼리를 *Read Replica*로 분리 (OLTP의 MVCC·vacuum과 격리)
- 장기 트랜잭션 모니터링 알람 (`pg_stat_activity`에서 *xact_start 오래된* 트랜잭션 탐지)

**결과:**
- OLTP bloat·디스크 급증 소멸
- 분석은 replica에서 자유롭게 (OLTP 영향 0)

**교훈:** MVCC는 *읽기/쓰기가 서로 안 막는* 대신 **Old version 누적 비용**이 있다. **장기 트랜잭션은 vacuum을 막아 dead tuple bloat**를 유발한다. 무거운 분석 쿼리는 *read replica로 분리*하고, *장기 트랜잭션을 모니터링*한다.

</details>

### 🔄 꼬리질문 3: 일관성을 더 높이면 처리량은 어떻게 변하나요?

**기대 답변:**
- SERIALIZABLE은 직렬화 가능 충돌 감지 비용 + retry 증가
- 처리량은 보통 RC > RR > SERIALIZABLE
- 비즈니스가 진짜로 필요한 격리만 선택. *모든 트랜잭션을 SERIALIZABLE*은 안티패턴.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** write skew 사고를 겪은 뒤 *"안전하게 가자"* 며 **전체 트랜잭션을 SERIALIZABLE**로 올림. 그러자 *직렬화 충돌 retry가 폭증*해 처리량이 50% 떨어지고 p99도 급등.

**진단:**
- SERIALIZABLE은 *모든 트랜잭션에 직렬화 가능 충돌 감지 + 충돌 시 abort/재시도*
- 대부분의 트랜잭션은 *충돌 위험이 없는데도* 그 비용을 부담
- 처리량 RC > RR > SERIALIZABLE 순으로 떨어짐

**조치 — 필요한 곳만 격리 상향:**
- 전체를 RC(기본)로 되돌림
- *집합 불변식이 걸린 핵심 트랜잭션*(온콜 스케줄, 재고 등)만 SERIALIZABLE + 재시도
- 나머지는 RC + 원자적 UPDATE/낙관적 락으로 충분

**결과:**
- 처리량 복구 (50% 손실 → 거의 원복)
- 핵심 불변식은 여전히 SERIALIZABLE로 보호

**교훈:** *"안전하니까 전부 SERIALIZABLE"* 은 안티패턴이다 — **충돌 없는 트랜잭션까지 retry 비용**을 떠안아 처리량이 급락한다. 격리 수준은 *트랜잭션 단위*로, *진짜 필요한 곳(집합 불변식)만* 상향한다. 처리량은 RC > RR > SERIALIZABLE 순.

</details>

---

## 3. Write Amplification

### Q3. Write Amplification이 뭐고 어디서 발생하나요?

**기대 답변:**
애플리케이션이 요청한 쓰기보다 **실제 디스크 쓰기가 더 커지는** 현상입니다.
- LSM Tree(RocksDB, Cassandra): Compaction이 반복 쓰기 유발
- WAL: 데이터 + 로그 = 최소 2배
- SSD: 페이지 단위 GC로 추가 증폭

영향: 처리량 한계, SSD 수명, 비용.

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** Cassandra 기반 메시징 시스템 — 매일 5억 메시지 INSERT. *읽기 쿼리가 갑자기 30초*로 늘어남.

**진단:**
- 메시지는 TTL 7일로 자동 삭제
- 그런데 한 partition에 tombstone 50,000개 누적
- 읽기 시 tombstone도 스캔 대상 → 30초 응답

**원인:**
- 데이터 모델: `PRIMARY KEY (chatroom_id, message_id)`
- 한 채팅방의 메시지가 같은 파티션
- 7일치 메시지가 끝없이 삭제·생성 → tombstone 폭증

**Write Amplification 측정:**
- 애플리케이션 쓰기: 5억 row/day × 1KB = 500GB
- 디스크 쓰기 (iostat): 2.1TB/day → **WA = 4.2배**
- 원인:
  - Memtable → SSTable flush (×1)
  - Leveled compaction (×3.2)
  - WAL (×1)

**해결 — 데이터 모델 + Compaction 정책:**

**1) TimeWindow Compaction Strategy 도입:**
```cql
ALTER TABLE messages WITH compaction = {
  'class': 'TimeWindowCompactionStrategy',
  'compaction_window_unit': 'DAYS',
  'compaction_window_size': 1
};
```
- 하루 단위 SSTable → 7일 지난 SSTable은 *통째로 삭제* (tombstone 무관)
- Leveled compaction의 반복 쓰기 회피

**2) 파티션 재설계:**
- `PRIMARY KEY ((chatroom_id, day), message_id)`
- day로 파티션 분할 → 한 파티션 크기 제한

**3) Tombstone 관리:**
- `tombstone_warn_threshold: 1000`, `tombstone_failure_threshold: 100000`
- TTL 정확히 지나면 자동 GC

**결과:**
- Write Amplification: 4.2배 → 1.6배
- 디스크 사용량 60% 감소
- 읽기 p99: 30s → 25ms

**교훈:**
- 자주 삭제되는 데이터에는 **TimeWindow Compaction** 정석
- 데이터 모델 단계에서 *TTL 패턴*과 *파티션 크기*를 같이 설계
- WA는 *디스크 비용 + SSD 수명 + 응답속도*에 동시 영향

</details>

### 🔄 꼬리질문 1: Compaction 정책별 트레이드오프는?

**기대 답변:**
- **Leveled**: 읽기 amplification 낮음, 쓰기 amplification 높음 (RocksDB 기본)
- **Tiered**: 쓰기 amplification 낮음, 읽기 amplification 높음 (Cassandra STCS)
- **Universal**: 절충형

쓰기가 많으면 Tiered, 읽기가 많으면 Leveled.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 로그 적재용 Cassandra 테이블(write 99% / read 1%)에 기본인 *Leveled Compaction(LCS)* 을 그대로 사용. write amplification이 *5배*까지 치솟아 디스크 IO가 한계, 적재 처리량이 급락.

**진단:**
- LCS는 *읽기 최적화*형 → SSTable 레벨을 촘촘히 유지하려 *쓰기마다 반복 compaction* → write amp 큼
- 우리 워크로드는 *write가 99%* → LCS의 읽기 이점은 안 쓰면서 쓰기 비용만 떠안음

**조치 — 워크로드에 맞는 Compaction:**
- LCS → **STCS(Size-Tiered Compaction)** 로 변경 → 비슷한 크기 SSTable을 모아 *덜 자주* compaction → write amp 감소
- read가 거의 없으니 STCS의 *읽기 amp 증가는 무해*

**결과:**
- write amplification 5배 → 2배, 디스크 IO 여유 회복
- 적재 처리량 정상화

**교훈:** Compaction은 *워크로드(read/write 비율)로 선택*한다. **Leveled = 읽기 최적화(쓰기 amp 큼), Tiered = 쓰기 최적화(읽기 amp 큼)**. write-heavy 로그에 LCS를 쓰면 *안 쓰는 읽기 이점 대가로 쓰기 비용*만 떠안는다.

</details>

### 🔄 꼬리질문 2: Tombstone이 왜 비용이 되나요?

**기대 답변:**
- 삭제도 *쓰기*로 표현 (tombstone)
- TTL 만료 전까지 디스크·메모리에 남아 읽기 시 스캔 대상
- Cassandra에선 partition 안 tombstone이 일정 수 넘으면 쿼리 실패

→ 데이터 모델 단계에서 *영구 삭제 vs 갱신* 정책을 결정해야 합니다.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** Cassandra 채팅 메시지 조회가 어느 순간 `TombstoneOverwhelmingException`으로 *읽기 자체가 실패*. 특정 활발한 채팅방에서만 발생.

**진단:**
- 그 채팅방 파티션에 *tombstone(삭제 마커)이 10만 개* 누적 → Cassandra의 `tombstone_failure_threshold(10만)` 초과 → 쿼리 거부
- 원인: `PRIMARY KEY (chatroom_id, message_id)` → *한 채팅방 = 한 파티션*에 7일치 삭제 메시지가 다 쌓임
- TTL 만료된 메시지가 *tombstone으로 남아 읽기 시 스캔 대상*

**조치 — 파티션 분할 + Compaction:**
- 파티션 키에 `day` 추가: `((chatroom_id, day), message_id)` → 하루 단위로 파티션 분할 → 파티션당 tombstone 제한
- TimeWindow Compaction으로 *오래된 SSTable을 통째 삭제*(tombstone 스캔 회피)

**결과:**
- tombstone 임계 초과 소멸, 읽기 정상 복구
- 파티션 크기도 예측 가능해짐

**교훈:** Cassandra에서 *삭제는 쓰기(tombstone)* 이고, **파티션당 tombstone이 임계를 넘으면 읽기 자체가 실패**한다. "한 엔티티 = 한 파티션"에 *삭제가 잦은 데이터*를 몰면 터진다. 데이터 모델 단계에서 *파티션 분할(day 등)* 과 *TTL/Compaction 정책*을 함께 설계해야 한다.

</details>

### 🔄 꼬리질문 3: 운영에서 amplification을 어떻게 모니터링하나요?

**기대 답변:**
- 디스크 쓰기 처리량(`iostat`) vs 애플리케이션 쓰기량 비율
- LSM 엔진의 compaction 메트릭(rocksdb: `WRITE_AMP`)
- SSD SMART의 wear leveling 지표
- 알람은 *amp 비율 + 디스크 여유*로 조합

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** SSD 기반 DB 클러스터에서 *예고 없이 SSD가 수명을 다해* 한 노드가 죽고, 백업·교체에 긴급 대응. "왜 미리 몰랐나"는 회고.

**진단:**
- write amplification이 *조용히 누적*되어 SSD 마모를 가속했는데 *아무도 추적 안 함*
- 디스크 *용량*만 모니터링하고 *쓰기 증폭·SSD 마모도*는 안 봄

**조치 — WA·마모도 상시 모니터링:**
- RocksDB `WRITE_AMP` 메트릭을 Grafana에 → *5배 초과 시 알람* (Compaction 정책 재검토 트리거)
- SSD *SMART의 wear leveling(마모도)* 지표 수집 → *70% 도달 시 사전 교체*
- 알람을 *amp 비율 + 디스크 여유*로 조합 (둘 다 나빠지면 critical)

**결과:**
- 이후 SSD를 *예고된 시점에 사전 교체* (기습 사망 0건)
- WA 5배 알람으로 Compaction 정책 조기 조정

**교훈:** Write Amplification은 *디스크 용량이 아니라 SSD 수명*을 갉아먹는다. **RocksDB `WRITE_AMP` + SSD SMART 마모도**를 상시 모니터링해야 *기습 SSD 사망*을 예방한다. WA 모니터링은 *디스크 비용·수명의 선행 지표*다.

</details>

---

## 4. Postgres RLS와 멀티테넌시

### Q4. 멀티테넌트 환경에서 Row-Level Security를 도입한 경험이 있나요?

**기대 답변:**
WHERE 절 누락 사고를 막기 위해 DB 단에서 격리를 강제한 사례입니다.

3축:
1. **보안**: 정책으로 `current_setting('app.tenant_id')` 비교
2. **세션 컨텍스트**: 커넥션 대여 시점에 tenant ID를 세션 변수에 주입
3. **성능**: 인덱스가 정책 조건을 못 타면 풀스캔 → 재설계

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** SaaS 협업 도구 — 1만 테넌트 공유 DB. 신규 입사 개발자의 PR에서 `WHERE tenant_id = ?` 누락 발견. 다행히 prod 전 발견했으나 *DB 단 격리 필요* 합의.

**RLS 도입:**

**1단계 — 정책 추가:**
```sql
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON documents
  USING (tenant_id = current_setting('app.tenant_id')::int);

CREATE POLICY tenant_insert ON documents
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::int);
```

**2단계 — 세션 변수 주입 (HikariCP):**
```kotlin
class TenantAwareDataSource(private val delegate: DataSource) : DataSource by delegate {
  override fun getConnection(): Connection {
    val conn = delegate.connection
    val tenantId = TenantContext.current()
    conn.createStatement().execute("SET LOCAL app.tenant_id = '$tenantId'")
    return TenantAwareConnection(conn)  // close 시 RESET
  }
}

class TenantAwareConnection(private val delegate: Connection) : Connection by delegate {
  override fun close() {
    try { delegate.createStatement().execute("RESET app.tenant_id") }
    finally { delegate.close() }
  }
}
```
- **반드시 RESET** 안 하면 다른 tenant 요청에서 오염

**3단계 — 성능 검증 (예상 못 한 문제):**
```sql
EXPLAIN ANALYZE SELECT * FROM documents WHERE owner_id = 12345;
-- 결과: Seq Scan (RLS 정책 추가로 옵티마이저가 인덱스 못 탐)
```
- 기존 인덱스 `(owner_id)`는 RLS 조건 `(tenant_id)`를 포함 안 함
- 모든 row에 대해 RLS 정책 평가 → 풀스캔

**인덱스 재설계:**
```sql
DROP INDEX idx_documents_owner;
CREATE INDEX idx_documents_tenant_owner ON documents(tenant_id, owner_id);
```
- 모든 인덱스를 *tenant_id 선두*로 재구성
- 24개 테이블, 56개 인덱스 변경

**4단계 — 회귀 테스트:**
- TestContainer로 *다른 tenant ID* 환경 만들어 회귀
- `assertThat(documents).allMatch { it.tenantId == 1 }` 강제

**결과:**
- 6개월간 *tenant 격리 사고 0건*
- 신규 입사자 PR에서 WHERE 누락이 있어도 DB가 막아줌
- 인덱스 재설계로 일부 쿼리는 *오히려 더 빨라짐* (선두 필터링 효율)

**예상치 못한 비용:**
- 슈퍼유저(`BYPASSRLS`) 권한 관리가 까다로움 (배치, 마이그레이션)
- `EXPLAIN`이 RLS 조건 포함되어 디버깅 가독성 저하

**교훈:**
- RLS는 *defense in depth*의 강력한 도구
- 도입 시 **인덱스 전부 재설계** 각오 필요
- 세션 변수 RESET 안 하면 *역으로 데이터 오염*

</details>

### 🔄 꼬리질문 1: 커넥션 풀에서 세션 오염은 어떻게 막나요?

**기대 답변:**
- 반납 시점에 `RESET app.tenant_id` 또는 `DISCARD ALL`
- HikariCP `connectionInitSql` + `connectionTestQuery` 활용
- 풀 단위 검증 테스트 (다른 tenant ID로 회귀 테스트)

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** RLS 도입 직후, *테넌트 A의 요청이 테넌트 B의 데이터*를 조회하는 *역대급 보안 사고* 직전까지 감 (QA에서 발견). 격리하려고 RLS를 넣었는데 오히려 *교차 노출*.

**진단 — 커넥션 풀 세션 오염:**
- 커넥션 대여 시 `SET app.tenant_id = A`로 설정
- 그런데 *반납 시 RESET을 안 함* → 같은 커넥션이 *테넌트 B 요청에 재사용*될 때 *A의 tenant_id가 남아있음*
- B가 *A의 데이터*를 조회 (RLS 정책이 A 기준으로 동작)

**조치:**
- 커넥션 *반납 시점에 `RESET app.tenant_id`* (또는 `DISCARD ALL`) 강제 (래퍼 Connection의 `close()`에서)
- HikariCP `connectionInitSql`로 대여 시에도 초기화
- CI에 *서로 다른 tenant ID로 커넥션 재사용 검증 테스트* 추가 (회귀 방지)

**결과:**
- 교차 노출 사고 0건
- 커넥션 재사용에도 안전

**교훈:** 세션 변수 기반 RLS는 *커넥션 풀 재사용* 때문에 **반납 시 RESET을 안 하면 역으로 데이터가 오염**된다 (격리하려다 교차 노출). *대여 시 설정 + 반납 시 RESET* 양쪽을 강제하고, *다른 tenant로 커넥션 재사용하는 회귀 테스트*로 검증한다.

</details>

### 🔄 꼬리질문 2: 성능 영향은 어떻게 측정하나요?

**기대 답변:**
- `EXPLAIN (ANALYZE, BUFFERS)`로 정책 적용 전후 비교
- 정책 조건을 인덱스 첫 컬럼으로 두기
- 통계 정보(extended statistics)로 옵티마이저 추정 보정

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** RLS 적용 후 일부 조회가 *갑자기 풀스캔으로 회귀*해 응답이 수십 배 느려짐. "RLS가 느리다"는 불만이 나옴.

**진단 — `EXPLAIN (ANALYZE, BUFFERS)` 전후 비교:**
- RLS 적용 전: `Index Scan using idx_owner`
- RLS 적용 후: `Seq Scan` — RLS가 추가한 `tenant_id = ...` 조건이 *기존 `(owner_id)` 인덱스에 없어* 인덱스를 못 탐
- 즉, 모든 쿼리에 *암묵적으로 tenant_id 조건이 붙는데* 인덱스가 그걸 반영 안 함

**조치:**
- 모든 인덱스를 **`tenant_id` 선두**로 재구성 (`(tenant_id, owner_id)` 등)
- extended statistics로 *tenant_id와 다른 컬럼의 상관관계* 보정

**결과:**
- 인덱스 정상 사용 → 풀스캔 회귀 소멸
- *일부 쿼리는 오히려 더 빨라짐* (tenant_id 선두로 먼저 좁혀서)

**교훈:** RLS는 *모든 쿼리에 암묵적 조건(`tenant_id`)을 추가*하므로, **기존 인덱스가 그 조건을 포함 안 하면 풀스캔으로 회귀**한다. `EXPLAIN (ANALYZE, BUFFERS)`로 전후를 비교하고, *모든 인덱스를 tenant_id 선두로 재설계*해야 한다. "RLS가 느린 게 아니라 인덱스가 안 맞는 것".

</details>

### 🔄 꼬리질문 3: RLS vs 애플리케이션 필터, 언제 어느 쪽?

**기대 답변:**
- RLS: 데이터 격리가 *법적/계약적 의무*인 경우 (의료, 금융)
- 애플리케이션 필터: 단일 팀이 소유, 코드 리뷰로 충분
- **둘 다**: 깊이 방어(defense in depth)가 필요한 경우

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 의료 데이터(HIPAA 준수)를 다루는 시스템에서, *애플리케이션 필터(`WHERE org_id = ?`)만으로* 격리하다가 보안 감사에서 *"개발자 실수 한 번이면 환자 데이터가 교차 노출될 수 있다"* 는 지적.

**판단 — 요구사항 강도로 결정:**
- 의료 데이터 격리는 *법적 의무(HIPAA)* → 단일 메커니즘으론 부족, *깊이 방어* 필요
- 일반 SaaS 협업 도구의 일부 테넌트 격리는 *코드 리뷰로 충분*했지만, 의료는 차원이 다름

**조치 — 의료 도메인엔 RLS + 앱 필터 둘 다:**
- **RLS**: DB 단에서 강제 (애플리케이션 WHERE 누락에도 안전망)
- **애플리케이션 필터**: 1차 방어 (성능·명시성)
- *한쪽이 뚫려도 다른 쪽이 막는* defense in depth

**결과:**
- 보안 감사 통과 (다층 방어 입증)
- 일반 SaaS 도메인은 *앱 필터만* 유지 (과투자 회피)

**교훈:** RLS vs 앱 필터는 *데이터 격리의 요구 강도*로 결정한다. **법적/계약적 의무(의료·금융)면 RLS + 앱 필터 둘 다(defense in depth), 단일 팀 소유의 일반 데이터면 앱 필터 + 코드 리뷰로 충분**. 모든 곳에 RLS를 강제하면 *인덱스 재설계·운영 부담*만 늘어난다.

</details>

---

## 5. PostgreSQL 쿼리 플랜 Flip 대응

### Q5. 잘 돌던 쿼리가 갑자기 느려진 경험이 있나요?

**기대 답변:**
**Plan Flip** — 통계 변동으로 옵티마이저가 다른 플랜을 선택하는 현상입니다.

3축:
1. **현상 파악**: pg_stat_statements + slow log + 플랜 캐시 비교
2. **단기 조치**: `pg_hint_plan`으로 인덱스 스캔 고정
3. **근본 해결**: 컬럼 간 상관관계를 인지하도록 **확장 통계(Extended Statistics)** 생성

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 새벽 4시 P1. 주문 검색 API 응답 12초, 평소 80ms. CPU 100%.

**1차 진단 (5분):**
```sql
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY total_exec_time DESC LIMIT 5;
```
- 주문 검색 쿼리 mean 12s 발견

**2차 — 플랜 비교:**
```sql
EXPLAIN ANALYZE
SELECT * FROM orders 
WHERE customer_id = ? AND status = 'PENDING'
ORDER BY created_at DESC LIMIT 50;

-- 현재: Nested Loop (Seq Scan on orders) ⚡
-- 어제: Index Scan using idx_customer_status_created
```
- 동일 쿼리, 다른 플랜
- 옵티마이저가 *customer_id 매칭 row 500만 추정* (실제 200건)

**원인:**
- 어젯밤 대량 마이그레이션 (오래된 PENDING 주문 일괄 처리)
- pg_stat 통계가 *처리 전 상태*로 머물러 있어 옵티마이저 오판
- `default_statistics_target = 100` → 변동 큰 컬럼 추적 부족

**단기 조치 (10분 — 장애 진화):**
```sql
-- pg_hint_plan으로 인덱스 강제
/*+ IndexScan(orders idx_customer_status_created) */
SELECT * FROM orders WHERE ...;
```
- 또는 임시로 `enable_seqscan = off` (위험, 추천 안 함)
- 응답 80ms 복귀

**근본 해결 (1주):**

**1) 통계 신선도:**
```sql
ALTER TABLE orders SET (
  autovacuum_analyze_scale_factor = 0.02,  -- 더 자주 ANALYZE
  default_statistics_target = 1000          -- 핫 컬럼만 상향
);
```

**2) Extended Statistics:**
```sql
-- customer_id와 status가 상관관계 있음 — VIP 고객은 주로 'COMPLETED'
CREATE STATISTICS s_orders_cust_status (mcv)
ON customer_id, status FROM orders;
ANALYZE orders;
```
- 다변량 통계로 옵티마이저가 *조건 조합*의 실제 분포 학습

**3) 자동화:**
- 대량 배치 후 `ANALYZE` 명시 실행
- pg_stat_statements 일간 리포트 → 1초 넘는 쿼리 알림

**관련 — 논리 복제 슬롯:**
- 같은 시기에 `restart_lsn` 모니터링도 시작
- 미사용 슬롯 즉시 Drop, Fail-over 시 자동 재생성 스크립트

**결과:**
- 같은 패턴(대량 배치 후 다음 날 새벽) 재발 없음 (3개월)
- 평균 쿼리 응답속도 -15% (extended stats 덕)

**교훈:**
- *잘 돌던 쿼리가 갑자기 느려짐* = Plan Flip 의심 1순위
- pg_hint_plan은 *진통제*, 근본은 통계 신선도 + extended stats
- 대량 배치 후엔 ANALYZE를 *명시적으로*

</details>

### 🔄 꼬리질문 1: 확장 통계가 뭐고 언제 필요한가요?

**기대 답변:**
- 두 컬럼이 강한 상관관계를 가질 때 옵티마이저는 독립이라고 가정 → 추정 오류
- `CREATE STATISTICS s1 ON col_a, col_b FROM tbl` 로 다변량 통계 수집
- 추정 오류로 nested loop이 풀스캔으로 바뀌는 케이스에 결정적

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** `WHERE city = '서울' AND district = '강남구'` 쿼리가 *간헐적으로 플랜이 튀어* 풀스캔. 단일 컬럼 인덱스·통계는 다 정상인데 조합 쿼리만 오판.

**진단 — 컬럼 상관관계 미인지:**
- 옵티마이저는 *city와 district를 독립*으로 가정 → `P(서울) × P(강남구)` = 매우 작은 확률로 추정 → "거의 없겠네" 하고 잘못된 플랜
- 실제로는 *강남구는 무조건 서울* (강한 상관관계) → 실제 매칭 행이 추정보다 훨씬 많음
- 추정-실제 괴리로 nested loop이 잘못 선택됨

**조치 — Extended Statistics:**
```sql
CREATE STATISTICS s_addr (mcv, dependencies)
ON city, district FROM addresses;
ANALYZE addresses;
```
- 다변량 통계로 옵티마이저가 *city-district 함수적 종속성*을 학습 → 정확한 추정

**결과:**
- 플랜 flip 소멸, 일관되게 인덱스 스캔
- 추정-실제 괴리 해소

**교훈:** 옵티마이저는 기본적으로 *컬럼을 독립으로 가정*한다. **city-district, customer-status처럼 강한 상관관계가 있는 컬럼 조합**은 추정이 크게 빗나가 plan flip을 유발한다. **`CREATE STATISTICS ... (mcv, dependencies)`** 로 다변량 통계를 주면 정확해진다.

</details>

### 🔄 꼬리질문 2: 논리 복제 슬롯도 같이 다뤄본 적 있나요?

**기대 답변:**
- 슬롯이 WAL을 붙잡고 있으면 디스크 풀 위험
- `restart_lsn` 상시 모니터링, 미사용 슬롯 즉시 Drop
- Fail-over 시 슬롯이 대기 서버로 복제되지 않으므로 **재생성 자동화 + LSN 정합성 검증** 필요

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** CDC 컨슈머(Debezium)가 배포 이슈로 *3일간 중단*됐는데, 그 사이 PostgreSQL *디스크 사용량이 95%까지 차올라* DB가 멈출 뻔한 장애.

**진단 — 복제 슬롯이 WAL을 붙잡음:**
- 논리 복제 슬롯은 *컨슈머가 아직 안 읽은 WAL을 보관*해야 함 (재개 대비)
- 컨슈머가 3일 중단 → 슬롯이 *3일치 WAL을 못 버리고 계속 쌓음* → 디스크 폭증
- `pg_replication_slots`의 *`restart_lsn`이 3일째 정지*

**조치:**
- 즉시: *중단된 슬롯의 lag(`restart_lsn` vs 현재 WAL)* 확인 → 컨슈머 복구 or *미사용 슬롯 Drop*
- 영구: `pg_replication_slots` lag을 *상시 모니터링 알람* (lag > 임계 시) + *컨슈머 헬스체크*
- Fail-over 시 슬롯이 *대기 서버로 복제 안 되므로*, 승격 후 *슬롯 재생성 + LSN 정합성 검증* 스크립트 마련

**결과:**
- 디스크 폭증 사전 차단 (lag 알람으로 조기 인지)
- Fail-over 시 슬롯 유실로 인한 CDC 중단도 자동 복구

**교훈:** 논리 복제 슬롯은 *컨슈머가 멈추면 WAL을 무한정 붙잡아* 디스크를 채운다. **`restart_lsn` lag 상시 모니터링 + 컨슈머 헬스체크**가 필수. Fail-over 시엔 *슬롯이 대기 서버로 복제 안 되므로* 재생성·LSN 검증 자동화가 필요하다.

</details>

### 🔄 꼬리질문 3: 통계 신선도를 어떻게 관리하나요?

**기대 답변:**
- autovacuum threshold를 핫 테이블 별로 조정
- 대량 적재 후 수동 `ANALYZE`
- 통계 샘플 비율(`default_statistics_target`)을 핫 컬럼만 100→1000 정도로 상향

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 매일 새벽 *대량 배치*(오래된 주문 상태 일괄 변경) 직후, *다음 날 아침마다 주문 검색이 plan flip으로 느려지는* 패턴이 반복. autovacuum이 *배치 변경량을 따라잡기 전*에 아침 트래픽이 시작.

**진단:**
- autovacuum의 `analyze_scale_factor`(기본 0.1) = "테이블의 10%가 바뀌어야 ANALYZE"
- 대량 배치는 *밤사이 통계를 stale하게* 만드는데, autovacuum이 *아침까지 못 따라잡음*
- stale 통계로 옵티마이저가 오판 → plan flip

**조치 — 배치 절차에 통계 갱신 포함:**
- *마이그레이션/배치 스크립트 마지막에 명시적 `ANALYZE orders`* 추가 (autovacuum 안 기다림)
- 핫 테이블은 `autovacuum_analyze_scale_factor = 0.02`로 더 공격적으로
- 변동 큰 핫 컬럼만 `default_statistics_target = 1000` 상향 (샘플 정밀도)

**결과:**
- 배치 다음 날 아침 plan flip 소멸 (3개월)
- "배치 후 통계 갱신"이 절차로 정착

**교훈:** 통계 신선도 관리의 핵심은 *autovacuum에만 맡기지 않는 것*이다. **대량 배치/마이그레이션 끝에 명시적 `ANALYZE`** 를 넣어야 *다음 트래픽 전에* 통계가 최신화된다. 핫 테이블은 `analyze_scale_factor`를 공격적으로, 핫 컬럼은 `statistics_target`을 상향한다. 통계 관리는 *마이그레이션 절차의 일부*다.

</details>

---

## 마무리: 7편 핵심 정리

1. **인덱스**: 카디널리티·통계·쿼리 형태가 같이 봐야 할 변수
2. **격리 수준**: RC vs RR vs SERIALIZABLE의 trade-off
3. **Write Amplification**: Compaction 정책과 tombstone 비용
4. **RLS**: 세션 오염 방지 + 인덱스 영향 검증
5. **Plan Flip**: pg_hint_plan + 확장 통계 + 통계 신선도

다음 8편은 **플랫폼/배포** — Zero-Copy, Helm Base Chart, ArgoCD, Distroless, PR Preview env를 다룹니다.

```toc
```
