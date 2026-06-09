---
layout: post
emoji: 🔐
title: "시니어 백엔드 면접 질문 9편 - 네트워크/보안 (5~10년차)"
date: '2026-06-09 12:40:00'
author: 손(Son/손민기)
tags: 백엔드 면접 시니어 네트워크 보안 DNS TLS JWT 세션 RefreshToken ACL 꼬리질문
categories: CS
series: "시니어 백엔드 면접 질문"
---

9편은 **네트워크와 보안**입니다. 면접관은 프로토콜 외우기보다 **운영 중 어디서 비용이 들었고 무엇을 모니터링했는지**를 봅니다.

**시리즈 구성:**
- 1~8편 (이전): 인프라 / 운영 / 설계 / 동시성 / 분산 / 가용성 / DB / 플랫폼
- **9편 (현재)**: 네트워크/보안
- 부록 (예정): 면접 마지막 5분 - 역질문 20선

---

## 1. DNS TTL

### Q1. DNS TTL을 무조건 짧게 두면 좋을까요?

**기대 답변:**
아닙니다. 트레이드오프:
- **짧은 TTL**: 장애 시 빠른 IP 전환 가능, 캐시 히트율 저하·DNS 쿼리 증가
- **긴 TTL**: 캐시 효율 좋음, 장애 전파 느림

운영 패턴: 평소 TTL 5~30분, 점검·DR 직전 60초로 선제 인하 후 작업.

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 메인 리전 AWS Tokyo 장애. DR 리전(Seoul)으로 전환 시도. 평소 DNS TTL이 *3600초(1시간)*로 설정되어 있어 **30분간 사용자 80%가 못 들어옴**.

**장애 타임라인:**

| 시점 | 이벤트 |
|---|---|
| T+0 | Tokyo 리전 네트워크 장애 |
| T+2분 | 모니터링 알람, DR 결정 |
| T+5분 | Route 53 가중치 변경 (Tokyo 0%, Seoul 100%) |
| T+5분~35분 | **사용자 80%가 여전히 Tokyo IP로 접속** (DNS 캐시) |
| T+35분 | 대부분 캐시 만료, Seoul로 전환 완료 |

**근본 원인:**
- TTL 3600초 설정, 다양한 ISP·브라우저가 *최대 1시간 캐시*
- 일부 브라우저는 *DNS pinning*으로 추가 캐시 (Chrome 약 60초 추가)
- 사용자 단말 OS 캐시까지 합치면 30분~1시간

**개선 — DNS 운영 정책 재설계:**

**평소 TTL:**
- 메인 도메인: **300초 (5분)** — DR 대응 가능 시간
- 정적 자산(CDN): **3600초** — 캐시 효율 우선
- 신규 도메인: 60초 (안정될 때까지)

**DR 직전 선제 인하:**
- 계획된 점검 24시간 전 TTL을 60초로 낮춤
- 점검 끝나면 원복

**DNS 외 안전망:**
- L7 로드밸런서 레벨 헬스체크 + 자동 페일오버 (DNS와 무관, 즉시 작동)
- 가중치 조절은 DNS가 아닌 *AWS Global Accelerator* 활용 (Anycast IP, 즉시 전환)

**브라우저 캐시 회피 — Anycast:**
- 사용자가 같은 IP에 접속해도 BGP가 가장 가까운 리전으로 라우팅
- 리전 장애 시 BGP가 자동으로 다른 리전으로 (DNS 변경 불필요)

**결과 (다음 DR 훈련):**
- 실제 DR 전환 시간: 30분 → 90초
- Global Accelerator 도입으로 DNS 의존도 자체 감소
- TTL 300초로 *과한 DNS 쿼리 부담 없이* DR 대응 가능

**관측:**
- DNS resolver 응답 시간 p99
- TTL 만료 vs 변경 후 트래픽 비율
- 캐시 hit ratio (CDN 사이드에서)

**교훈:**
- DNS TTL 결정은 *순수 DNS 문제가 아니라 DR 전략*의 일부
- 진짜 빠른 페일오버는 *DNS가 아닌 LB 또는 Anycast*가 답
- DR 훈련에서 *실제 전환 시간*을 측정해 TTL 정책 검증

</details>

### 🔄 꼬리질문 1: 브라우저 DNS 핀닝의 함정은?

**기대 답변:**
- 일부 브라우저(Chrome 등)는 자체 캐시를 60초 이상 유지
- DNS 변경해도 사용자 화면에서 즉시 반영 안 됨
- → 장애 대응은 DNS만 의존하지 말고 **L4/L7 로드밸런서 레벨**에서 전환

### 🔄 꼬리질문 2: 네거티브 캐시는 뭔가요?

**기대 답변:**
- 응답이 `NXDOMAIN`이면 그 결과도 캐시됨 (SOA의 minimum TTL)
- 새 도메인 추가 직후 일정 시간 못 찾는 현상이 여기서 나옴
- 회피: SOA TTL을 미리 짧게 설정

### 🔄 꼬리질문 3: 운영에서 어떤 지표를 보나요?

**기대 답변:**
- DNS 쿼리 QPS와 캐시 hit ratio
- Resolver 응답 시간 p99
- 변경 후 새 IP로의 트래픽 비율 (CDN/LB 로그로 추적)

---

## 2. Refresh Token Rotation

### Q2. Refresh Token 탈취에 어떻게 대비하시나요?

**기대 답변:**
**Token Rotation** — 갱신 요청마다 새 refresh token을 발급하고 이전 토큰은 무효화합니다.
- 이미 사용된 토큰이 다시 들어오면 *탈취* 의심
- 해당 사용자의 **토큰 패밀리 전체 무효화** + 강제 로그아웃
- 무효화 이력은 Redis로 빠르게 조회

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 보안팀이 *VPN 우회 패턴* 사용자 12명 발견. Refresh token 탈취 의심.

**탐지 — Token Rotation 추적:**

```kotlin
data class RefreshTokenRecord(
  val tokenId: String,
  val familyId: String,        // 같은 로그인 세션의 모든 토큰이 공유
  val userId: Long,
  val issuedAt: Instant,
  val usedAt: Instant?,        // 사용되면 기록
  val expiresAt: Instant
)

fun refresh(oldToken: String): TokenPair {
  val record = tokenStore.get(oldToken) ?: throw InvalidTokenException()
  
  // 🚨 이미 사용된 토큰이 다시 들어옴 → 탈취 의심
  if (record.usedAt != null) {
    securityLog.warn("Refresh token reuse detected: family=${record.familyId}")
    invalidateFamily(record.familyId)  // 패밀리 전체 무효화
    throw TokenReusedException()
  }
  
  // 정상 갱신
  record.markUsed()
  val newRefresh = generateRefreshToken(record.familyId, record.userId)
  val newAccess = generateAccessToken(record.userId, ttl = 15.minutes)
  
  return TokenPair(newAccess, newRefresh)
}

fun invalidateFamily(familyId: String) {
  tokenStore.deleteByFamily(familyId)
  // 사용자에게 푸시 알림: "다른 기기에서 로그인 의심"
}
```

**실제 탐지 사례:**

| 시점 | 이벤트 |
|---|---|
| T+0 | 정상 사용자 로그인, RT-1 발급 (familyId=F1) |
| T+30분 | 정상 갱신: RT-1 사용 → RT-2 발급, RT-1 markUsed |
| T+45분 | **공격자가 RT-1 재사용** → reuse 탐지 |
| T+45분 | F1 전체 무효화 — RT-2도 죽음 |
| T+45분 | 정상 사용자 강제 로그아웃 + 알림 |

**Redis 스토어 설계:**
- Key: `rt:{tokenId}` → Value: `{familyId, userId, used, expiresAt}`
- Family index: `rt-family:{familyId}` → Set of tokenIds
- TTL = refresh token 유효기간

**Race Condition 처리 (정상 사용자의 여러 탭):**
- 같은 RT를 여러 탭이 동시에 갱신 시도 → reuse로 오인 가능
- 해결: 갱신 후 짧은 grace window (5초) 동안 *동일 응답을 반환*
- BroadcastChannel API로 탭 간 새 토큰 공유

**저장 위치 — XSS 방어:**
- 브라우저: HttpOnly + Secure + SameSite=Strict 쿠키
- 모바일: Keychain (iOS) / EncryptedSharedPreferences (Android)
- LocalStorage 절대 금지

**결과:**
- 탈취 의심 12건 모두 *자동 차단 + 정상 사용자 강제 재로그인*
- 보안 사고 보고서 0건 (3개월)
- 정상 사용자의 강제 로그아웃 false positive 일 평균 2건 (grace window로 0건 수렴)

**교훈:**
- Token Rotation은 *완벽한 탈취 방지*가 아니라 *피해 최소화* 메커니즘
- Family 개념이 정상 사용자와 공격자 모두 차단하는 *명확성*의 핵심
- 운영에서 false positive 발생 시 *grace window + 사용자 친화 UX* 필요

</details>

### 🔄 꼬리질문 1: 정상 사용자와 탈취자를 어떻게 구분하나요?

**기대 답변:**
- 같은 refresh token이 두 번 사용되면 둘 중 하나는 탈취
- 어느 쪽이 정상인지 알 수 없으므로 **양쪽 모두 무효화**가 안전
- 디바이스 fingerprint(브라우저·IP·OS)로 보조 판단 가능하지만 결정적 증거 아님

### 🔄 꼬리질문 2: Rotation 도입 후 UX 영향은?

**기대 답변:**
- 정상 사용자도 약간의 race(여러 탭에서 동시 갱신)로 강제 로그아웃 가능
- 완화: 갱신 후 짧은 grace 윈도우 동안 구 토큰 허용
- 동일 토큰 동시 요청은 첫 응답을 다른 탭에 공유(BroadcastChannel)

### 🔄 꼬리질문 3: Refresh Token을 어디에 저장하나요?

**기대 답변:**
- 브라우저: **HttpOnly + Secure + SameSite=Strict** 쿠키
- 모바일: Keychain(iOS) / EncryptedSharedPreferences(Android)
- LocalStorage는 XSS에 노출되므로 금지

---

## 3. JWT vs Session

### Q3. JWT와 세션 중 어느 쪽이 좋은가요?

**기대 답변:**
도메인에 따라 다릅니다.
- **JWT (stateless)**: 서버 확장 용이, 토큰 자체에 정보 → 즉각 권한 회수 어려움
- **Session (stateful)**: 즉각 무효화 가능, 서버에 상태 저장 부담

**JWT는 짧은 access + Refresh Rotation**, **Session은 Redis 클러스터**로 보완하는 게 일반적입니다.

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** SNS 서비스가 JWT (TTL 24시간)로 시작. 1년 후 *악성 사용자 즉시 차단*이 비즈니스 요구사항으로 등장. JWT 구조의 한계 직면.

**JWT 구조의 한계:**
- 토큰 발급 후 *서버는 무효화할 수 없음* (검증만 가능)
- 24시간 TTL 만료까지 계속 유효
- 차단 요구사항: 5분 이내 무효화

**옵션 검토:**

**옵션 1 — JWT TTL을 5분으로 단축:**
- Refresh 호출 부하 24배 증가 (5분마다 ID provider 호출)
- 모바일 푸시 토큰 갱신 등 다른 작업도 영향
- 단점이 너무 큼

**옵션 2 — Blacklist 도입 (JWT 유지):**
- 차단된 토큰 ID를 Redis Set에 보관 (TTL = 토큰 만료까지)
- 모든 API에서 blacklist 조회 → *stateless 이점 사라짐*
- Redis 의존성 추가

**옵션 3 — Session 회귀:**
- Redis 클러스터에 세션 저장 (TTL 24시간)
- 차단 시 세션 한 키 삭제로 즉시 무효화
- 매 요청 Redis 조회 비용

**선택: 옵션 3 + 캐싱 최적화**

```kotlin
class SessionFilter : OncePerRequestFilter() {
  private val localCache = Caffeine.newBuilder()
    .expireAfterWrite(30, SECONDS)
    .maximumSize(100_000)
    .build<String, Session>()
  
  override fun doFilterInternal(req, res, chain) {
    val sessionId = req.getCookie("SID") ?: return chain.doFilter(req, res)
    
    // 1) 로컬 캐시 (30초)
    var session = localCache.getIfPresent(sessionId)
    
    // 2) Redis (캐시 미스)
    if (session == null) {
      session = redisSessionStore.get(sessionId) ?: throw UnauthorizedException()
      localCache.put(sessionId, session)
    }
    
    SecurityContext.set(session)
    chain.doFilter(req, res)
  }
}

// 차단 시 — 모든 인스턴스의 로컬 캐시도 무효화
fun banUser(userId: Long) {
  val sessions = redisSessionStore.findByUserId(userId)
  sessions.forEach { redisSessionStore.delete(it.sessionId) }
  
  // Pub/Sub로 로컬 캐시 무효화 전파
  redisPubSub.publish("session.invalidated", sessions.map { it.sessionId })
}
```

**Redis 구조:**
- 세션 키: `session:{sessionId}` → User 정보 + 권한
- 사용자 인덱스: `user-sessions:{userId}` → Set of sessionIds (멀티 디바이스)
- Sticky session 불필요 (어느 인스턴스든 Redis 조회)

**결과:**
- 악성 사용자 차단 시간: 24시간 → 평균 32초 (로컬 캐시 30초)
- Redis QPS: 12만 (전체 트래픽 기준), p99 0.5ms
- 운영 비용: Redis Cluster 6 노드 추가 (월 $400)

**교훈:**
- JWT는 *완벽한 stateless*가 매력이지만 *권한 회수 불가*가 치명적인 도메인이 있음
- Session도 *로컬 캐시*로 Redis QPS를 견딜 수 있음
- 선택 기준은 **즉각 회수가 필요한가?** — 필요하면 Session, 아니면 JWT + Rotation

</details>

### 🔄 꼬리질문 1: 강제 로그아웃을 JWT로 어떻게 구현하나요?

**기대 답변:**
- 짧은 access token TTL (5~15분) + Refresh로 보완
- **Blacklist**: 무효화한 token id를 Redis에 TTL만큼 보관
- 모든 API에서 blacklist 조회 → stateless 이점 약해짐

→ 즉각 회수가 핵심이면 Session이 더 적합합니다.

### 🔄 꼬리질문 2: JWT 페이로드에 뭘 넣어도 되나요?

**기대 답변:**
- 민감 정보 절대 금지 (signed지만 *encrypted*가 아님 — 누구나 디코드)
- 권한·역할 같은 정적 정보만
- 자주 변하는 정보는 매 갱신 시 다시 발급되도록

### 🔄 꼬리질문 3: 분산 환경에서 세션 일관성은?

**기대 답변:**
- **Sticky Session**: LB가 같은 서버로 라우팅 — 확장성 저하
- **Redis 클러스터 세션**: 일반적인 선택. p99 지연·만료 정책 관리
- **세션 복제**: 인스턴스 간 복제 — 노드 늘면 비용 폭증, 권장 안 함

---

## 4. TLS Handshake

### Q4. TLS 1.3에서 round trip이 줄어든 이유는?

**기대 답변:**
- 1.2: ClientHello → ServerHello → 인증서 → 키교환 → Finished (2 RTT)
- 1.3: ClientHello에 키 공유 후보 포함 → ServerHello에서 즉시 키 결정 (1 RTT)
- **0-RTT (Early Data)**: 이전 세션 PSK로 첫 패킷에 데이터 동봉 (0 RTT)

대신 0-RTT는 **재전송 공격** 위험이 있어 멱등한 요청에만 허용.

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 모바일 앱 — 외부 네트워크에서 첫 페이지 로드 1.8초. 분석 결과 TLS 핸드셰이크가 600ms 차지.

**기존 (TLS 1.2):**
- ClientHello (0~80ms)
- ServerHello + Certificate + KeyExchange (80~280ms)
- ClientKeyExchange + Finished (280~480ms)
- 데이터 전송 시작 (480ms~)
- **2 RTT 핸드셰이크 = 600ms (3G 환경)**

**개선 — TLS 1.3 + 운영 최적화:**

**1) TLS 1.3 도입:**
- nginx `ssl_protocols TLSv1.3 TLSv1.2;`
- 1 RTT로 단축 → 300ms

**2) Session Resumption (재방문 사용자):**
- 첫 방문 후 PSK 발급
- 재방문 시 *핸드셰이크 0 RTT* 또는 1 RTT
- session ticket 사용 (서버 간 공유 불필요)

**3) OCSP Stapling:**
- 인증서 폐기 확인을 *서버가 사전에 받아둔 응답*으로 첨부
- 클라이언트가 OCSP 서버에 별도 요청 안 함 (200ms 절감)
- nginx `ssl_stapling on; ssl_stapling_verify on;`

**4) 인증서 체인 최적화:**
- intermediate 인증서를 root만 포함 (불필요 chain 제거)
- 핸드셰이크 데이터 1.2KB → 750B

**5) HTTP/3 (QUIC) 검토:**
- 0 RTT 재연결, packet loss 회복 빠름
- 점진 도입 (CDN edge부터 시작)

**측정 결과 (3G 환경):**

| 단계 | 핸드셰이크 시간 |
|---|---|
| TLS 1.2 (기존) | 600ms |
| TLS 1.3 | 300ms |
| TLS 1.3 + OCSP Stapling | 250ms |
| TLS 1.3 + Session Resumption | 80ms (재방문) |
| HTTP/3 0-RTT | 20ms (재방문) |

**0-RTT 보안 고려:**
- 첫 패킷에 데이터 동봉 가능 → *replay 공격* 위험
- 멱등 요청 (GET, idempotent POST)만 허용
- 인증/결제 등 민감 API는 0-RTT 거부 (nginx `ssl_early_data off` per location)

**결과:**
- 모바일 첫 페이지 로드: 1.8s → 1.1s
- 재방문 사용자 *체감 즉시* (Session Resumption)
- CA OCSP 서버 의존도 사라짐

**교훈:**
- TLS는 *보안 도구이지만 성능 영향이 큼*
- TLS 1.3 + Session Resumption + OCSP Stapling은 *기본 세팅*
- 0-RTT는 *멱등성*을 반드시 분리

</details>

### 🔄 꼬리질문 1: Session Resumption의 운영 효과는?

**기대 답변:**
- 재연결 시 풀 핸드셰이크 생략 → CPU·지연 절감
- 서버 측: session cache vs session ticket
- 대규모 환경에선 ticket이 확장성 유리 (서버 간 상태 공유 불필요)

### 🔄 꼬리질문 2: OCSP Stapling이 뭔가요?

**기대 답변:**
- 인증서 폐기 여부 확인을 클라이언트가 매번 OCSP 서버에 묻지 않고, 서버가 미리 받아둔 응답을 핸드셰이크에 첨부
- 사용자 지연 감소 + CA OCSP 서버 부하 감소
- nginx `ssl_stapling on` 같은 옵션으로 활성화

### 🔄 꼬리질문 3: mTLS는 언제 도입하나요?

**기대 답변:**
- 서비스 간 통신에서 서로 신뢰가 필요할 때 (예: 사내 zero-trust)
- 결제·인증 같은 고신뢰 경계
- Service Mesh(Istio, Linkerd)가 자동 mTLS 제공 — 운영 비용 크게 절감

---

## 5. ACL과 정책 엔진

### Q5. 복잡한 ACL 권한 로직을 비즈니스 코드와 어떻게 분리하시나요?

**기대 답변:**
3축:
1. **PDP/PIP 분리**: 정책 결정(Decision)과 정보 제공(Information)을 물리적으로 분리
2. **ABAC 모델**: 속성 기반 평가 (역할·리소스 상태·시간 등)
3. **결과 캐싱·비트마스크**: 평가 결과를 1ms 미만으로 유지

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 협업 도구 — 권한 로직이 50개 컨트롤러에 `if (user.role == ADMIN || resource.ownerId == user.id || ...)` 형태로 산재. 신규 권한 추가마다 50군데 수정.

**개선 — OPA (Open Policy Agent) 도입:**

**1) 권한을 Rego DSL로 분리:**
```rego
package authz

default allow = false

# 문서 읽기 권한
allow {
  input.action == "read"
  input.resource.type == "document"
  
  # 소유자 본인
  input.resource.owner_id == input.user.id
}

allow {
  input.action == "read"
  input.resource.type == "document"
  
  # 공유받은 사용자
  input.resource.shared_with[_] == input.user.id
}

allow {
  input.action == "read"
  input.resource.type == "document"
  
  # 관리자 + 같은 조직
  input.user.role == "ADMIN"
  input.user.org_id == input.resource.org_id
}

# 문서 삭제 권한
allow {
  input.action == "delete"
  input.resource.type == "document"
  input.resource.owner_id == input.user.id
}
```

**2) 아키텍처 — PDP/PIP 분리:**
```
[Application]
    ↓ check(user, action, resource)
[Authz SDK]
    ↓ input(user_attrs, resource_attrs, action)
[OPA Sidecar (PDP)]
    ↓ fetch missing attrs
[PIP (User DB, Resource DB)]
```

**3) 캐싱 + 비트마스크 최적화:**
- 사용자별 권한 비트마스크 미리 계산 (`READ=1, WRITE=2, DELETE=4, SHARE=8`)
- Redis 캐시 (TTL 5분)
- 조회: `(userPermissionMask & requiredMask) == requiredMask`
- 평균 평가 시간 0.3ms

**4) 정책 변경 → 캐시 무효화:**
- 정책 변경 이벤트를 Kafka로 발행
- 각 인스턴스가 로컬 캐시 무효화
- 강한 일관성 필요한 권한(예: 결제 권한)은 캐시 우회

**도입 전후 비교:**

| 항목 | Before | After |
|---|---|---|
| 권한 추가 작업 | 50개 파일 수정 | Rego 1개 수정 |
| 권한 평가 시간 | 평균 8ms (DB 조회) | 평균 0.3ms (캐시) |
| 정책 회귀 테스트 | 어려움 | Rego 단위 테스트 |
| 권한 변경 검토 | 코드 리뷰 분산 | Rego 변경 PR 한 곳 |

**예상 못 한 효과:**
- 보안팀이 Rego 직접 검토 가능 (개발자 의존도 감소)
- 정책 변경 *감사 로그*가 깔끔 (Git history = 변경 이력)

**위험:**
- OPA 사이드카 장애 시 인증 자체 마비 → 로컬 fallback 정책 (기본 deny)
- Rego 학습 곡선 (팀 학습 약 2주)

**결과:**
- 권한 관련 버그 70% 감소
- 신규 권한 도입 PR 평균 시간: 2일 → 4시간
- 보안 감사 통과율 100%

**교훈:**
- 권한은 *비즈니스 코드와 분리*하는 것이 장기적으로 압도적 이득
- ABAC는 *복잡도가 RBAC보다 높지만 표현력*이 결정적
- 정책 엔진 도입은 *코드 변경*이 아니라 *팀 R&R 변경*에 가까움 (보안팀이 정책 책임)

</details>

### 🔄 꼬리질문 1: 정책 변경 시 캐시 일관성은?

**기대 답변:**
- 정책 변경 이벤트를 카프카로 발행 → 각 인스턴스가 캐시 무효화
- TTL은 짧게 (1~5분)
- 강한 일관성이 필요한 권한은 매번 PDP 조회 (캐시 미사용)

### 🔄 꼬리질문 2: RBAC vs ABAC, 언제 어느 쪽?

**기대 답변:**
- **RBAC**: 역할 수가 적고 안정적일 때 (관리자/일반/게스트)
- **ABAC**: 리소스 상태나 컨텍스트가 권한에 영향 (소유자 본인만 수정 등)
- 실무에선 보통 RBAC + 일부 ABAC 정책 혼용

### 🔄 꼬리질문 3: 정책 엔진 도구는 뭐가 있나요?

**기대 답변:**
- **OPA (Open Policy Agent)**: Rego DSL, 사이드카로 배포
- **Cedar (AWS)**: 검증 도구 강력, JSON 기반
- **Casbin**: 가벼운 RBAC/ABAC 라이브러리

도입 시 *정책 변경 빈도*와 *팀 학습 비용*을 같이 평가.

---

## 마무리: 9편 핵심 정리

1. **DNS TTL**: 짧음/김의 트레이드오프 + 브라우저 핀닝 + 네거티브 캐시
2. **Refresh Token Rotation**: 패밀리 전체 무효화 + grace window
3. **JWT vs Session**: 즉각 회수 vs 확장성 + 분산 세션 전략
4. **TLS Handshake**: 1.3 1-RTT, 0-RTT 위험, Session Resumption·OCSP stapling
5. **ACL 정책 엔진**: PDP/PIP 분리 + 캐시 일관성 + RBAC/ABAC 혼용

다음 **부록**은 면접 마지막 5분에 던질 **역질문 20선**을 표 형식으로 정리합니다.

```toc
```
