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

### 🔄 꼬리질문 2: 커버링 인덱스가 항상 좋은 건가요?

**기대 답변:**
아닙니다.
- 인덱스 크기가 커져 쓰기·캐시 비용 증가
- 메모리 효율성 저하 (버퍼 풀에 더 적게 들어감)
- 컬럼 변경 시 인덱스 재구성 비용

자주 쓰이는 조회만 선별적으로 커버링.

### 🔄 꼬리질문 3: JPA N+1과 인덱스의 관계는?

**기대 답변:**
N+1은 *쿼리 횟수* 문제지만 인덱스가 없으면 N개의 풀스캔이 폭주합니다.
- ToOne 관계는 페치 조인으로 1쿼리화
- ToMany는 `default_batch_fetch_size`로 IN 쿼리 (카르테시안 곱 회피)
- FK 컬럼 인덱스는 기본으로 보장

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

### 🔄 꼬리질문 2: MVCC가 어떻게 격리 수준을 보장하나요?

**기대 답변:**
- 각 행이 버전(`xmin`/`xmax`)을 가짐
- 트랜잭션은 자기 시점의 visible 버전만 봄
- 읽기와 쓰기가 서로 블로킹하지 않음 (락 vs 락 충돌만 발생)

비용은 **Undo/Old version 누적** → vacuum/cleanup 필요.

### 🔄 꼬리질문 3: 일관성을 더 높이면 처리량은 어떻게 변하나요?

**기대 답변:**
- SERIALIZABLE은 직렬화 가능 충돌 감지 비용 + retry 증가
- 처리량은 보통 RC > RR > SERIALIZABLE
- 비즈니스가 진짜로 필요한 격리만 선택. *모든 트랜잭션을 SERIALIZABLE*은 안티패턴.

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

### 🔄 꼬리질문 2: Tombstone이 왜 비용이 되나요?

**기대 답변:**
- 삭제도 *쓰기*로 표현 (tombstone)
- TTL 만료 전까지 디스크·메모리에 남아 읽기 시 스캔 대상
- Cassandra에선 partition 안 tombstone이 일정 수 넘으면 쿼리 실패

→ 데이터 모델 단계에서 *영구 삭제 vs 갱신* 정책을 결정해야 합니다.

### 🔄 꼬리질문 3: 운영에서 amplification을 어떻게 모니터링하나요?

**기대 답변:**
- 디스크 쓰기 처리량(`iostat`) vs 애플리케이션 쓰기량 비율
- LSM 엔진의 compaction 메트릭(rocksdb: `WRITE_AMP`)
- SSD SMART의 wear leveling 지표
- 알람은 *amp 비율 + 디스크 여유*로 조합

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

### 🔄 꼬리질문 2: 성능 영향은 어떻게 측정하나요?

**기대 답변:**
- `EXPLAIN (ANALYZE, BUFFERS)`로 정책 적용 전후 비교
- 정책 조건을 인덱스 첫 컬럼으로 두기
- 통계 정보(extended statistics)로 옵티마이저 추정 보정

### 🔄 꼬리질문 3: RLS vs 애플리케이션 필터, 언제 어느 쪽?

**기대 답변:**
- RLS: 데이터 격리가 *법적/계약적 의무*인 경우 (의료, 금융)
- 애플리케이션 필터: 단일 팀이 소유, 코드 리뷰로 충분
- **둘 다**: 깊이 방어(defense in depth)가 필요한 경우

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

### 🔄 꼬리질문 2: 논리 복제 슬롯도 같이 다뤄본 적 있나요?

**기대 답변:**
- 슬롯이 WAL을 붙잡고 있으면 디스크 풀 위험
- `restart_lsn` 상시 모니터링, 미사용 슬롯 즉시 Drop
- Fail-over 시 슬롯이 대기 서버로 복제되지 않으므로 **재생성 자동화 + LSN 정합성 검증** 필요

### 🔄 꼬리질문 3: 통계 신선도를 어떻게 관리하나요?

**기대 답변:**
- autovacuum threshold를 핫 테이블 별로 조정
- 대량 적재 후 수동 `ANALYZE`
- 통계 샘플 비율(`default_statistics_target`)을 핫 컬럼만 100→1000 정도로 상향

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
