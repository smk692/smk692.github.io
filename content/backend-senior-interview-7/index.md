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
