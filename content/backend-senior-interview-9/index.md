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
- 일부 브라우저는 *DNS pinning*으로 추가 캐시
- 사용자 단말 OS 캐시까지 합치면 30분~1시간

**개선 — DNS 운영 정책 재설계:**

**평소 TTL:**
- 메인 도메인: **300초 (5분)** — DR 대응 가능 시간
- 정적 자산(CDN): **3600초** — 캐시 효율 우선

**DR 직전 선제 인하:**
- 계획된 점검 24시간 전 TTL을 60초로 낮춤

**DNS 외 안전망:**
- L7 로드밸런서 헬스체크 + 자동 페일오버 (DNS 무관, 즉시 작동)
- **AWS Global Accelerator** (Anycast IP, 즉시 전환)

**브라우저 캐시 회피 — Anycast:**
- 같은 IP에 접속해도 BGP가 가장 가까운 리전으로 라우팅
- 리전 장애 시 BGP가 자동 전환 (DNS 변경 불필요)

**결과 (다음 DR 훈련):**
- 실제 DR 전환 시간: 30분 → 90초
- Global Accelerator 도입으로 DNS 의존도 자체 감소

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

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** DR 전환 시 DNS TTL을 60초로 짧게 줄였는데도, *일부 사용자(주로 Chrome)*가 *변경 후 5분 넘게도 옛 IP*로 접속해 장애 리전에 계속 붙음. "TTL 60초인데 왜 5분이나?"

**진단 — 브라우저 DNS 핀닝:**
- Chrome 등은 *자체 DNS 캐시*를 OS·TTL과 별개로 유지 (보통 60초+, 연결 재사용 시 더 길게)
- HTTP keep-alive 커넥션은 *이미 맺은 연결을 계속 재사용* → DNS 변경 무관하게 옛 IP 유지
- TTL을 줄여도 *브라우저·커넥션 레벨 캐시*는 못 건드림

**조치 — DNS 의존 탈피:**
- 장애 전환을 *DNS가 아니라 L7 LB / BGP Anycast 레벨*에서 수행
- Anycast는 *같은 IP*라 브라우저 캐시·핀닝과 무관하게 *BGP가 트래픽을 다른 리전으로* 라우팅

**결과:**
- 브라우저 핀닝 영향 0 (IP가 안 바뀌므로)
- DR 전환이 *브라우저 캐시 잔존* 없이 즉시 반영

**교훈:** 브라우저 DNS 핀닝·keep-alive 때문에 **DNS TTL을 줄여도 일부 사용자는 옛 IP에 잔존**한다. 진짜 빠른 전환은 *DNS 레벨이 아니라 L7 LB / BGP Anycast(같은 IP 유지)* 에서 해야 브라우저 캐시를 우회한다.

</details>

### 🔄 꼬리질문 2: 네거티브 캐시는 뭔가요?

**기대 답변:**
- 응답이 `NXDOMAIN`이면 그 결과도 캐시됨 (SOA의 minimum TTL)
- 새 도메인 추가 직후 일정 시간 못 찾는 현상이 여기서 나옴
- 회피: SOA TTL을 미리 짧게 설정

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 신규 서비스 도메인(`api-v2.example.com`)을 추가했는데, *일부 사용자는 추가 직후 1시간 가까이 "도메인을 찾을 수 없음"* 에러. 다른 사용자는 바로 접속됨. 일관성 없는 현상에 혼란.

**진단 — 네거티브 캐시:**
- 도메인 추가 *전*에 그 도메인을 조회한 resolver들이 *`NXDOMAIN`(없음) 응답을 캐시*
- 네거티브 캐시 TTL = *SOA 레코드의 minimum TTL*(1시간으로 설정돼 있었음)
- 그래서 도메인을 추가해도 *resolver가 캐시된 NXDOMAIN을 1시간 유지* → "못 찾음"

**조치:**
- *SOA의 minimum TTL을 미리 60초로* 낮춤 (네거티브 캐시 윈도우 축소)
- 신규 도메인은 *충분히 미리* 추가 (홍보·배포 전에)

**결과:**
- 신규 도메인 추가 후 *네거티브 캐시 잔존 1시간 → 1분*
- "일부만 못 접속" 현상 소멸

**교훈:** *없는 도메인 조회 응답(NXDOMAIN)도 캐시*된다 (네거티브 캐시, SOA minimum TTL 기준). 도메인을 *추가 전에 조회했던 resolver*는 캐시된 "없음"을 유지해 일시적으로 못 찾는다. **SOA minimum TTL을 미리 짧게** 두는 게 회피책.

</details>

### 🔄 꼬리질문 3: 운영에서 어떤 지표를 보나요?

**기대 답변:**
- DNS 쿼리 QPS와 캐시 hit ratio
- Resolver 응답 시간 p99
- 변경 후 새 IP로의 트래픽 비율 (CDN/LB 로그로 추적)

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** DR 훈련에서 DNS를 전환한 뒤 *"전환이 완료됐는지"* 를 *체감·추정*으로만 판단. 실제로는 *얼마나 많은 사용자가 새 IP로 옮겨갔는지* 객관적 지표가 없어 "이제 됐나?" 불확실.

**조치 — 트래픽 비율로 전환 진행률 측정:**
- *Route 53 query log + CloudWatch* 로 DNS 쿼리 추적
- *L7 LB 로그*에서 *신규 IP(Seoul) 도달 트래픽 비율* 을 실시간 계산
- 전환 후: 5분 50% → 30분 95% → "95% 도달 = 전환 사실상 완료" 객관 판정

**결과:**
- DR 전환 진행률을 *그래프로 실시간 확인* (체감 아님)
- "언제 옛 리전을 완전히 내려도 되는지" 데이터 기반 결정

**교훈:** DNS 전환 효과는 *체감이 아니라 트래픽 비율로 측정*한다. **Route 53 query log + LB 로그에서 "신규 IP 도달 트래픽 비율"** 을 추적하면 전환 진행률이 객관적으로 보인다. 이게 있어야 *옛 리전을 안전하게 내리는* 시점을 판단할 수 있다.

</details>

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
  val usedAt: Instant?,        // 사용되면 기록
)

fun refresh(oldToken: String): TokenPair {
  val record = tokenStore.get(oldToken) ?: throw InvalidTokenException()
  
  // 🚨 이미 사용된 토큰이 다시 들어옴 → 탈취 의심
  if (record.usedAt != null) {
    invalidateFamily(record.familyId)  // 패밀리 전체 무효화
    throw TokenReusedException()
  }
  record.markUsed()
  return TokenPair(newAccess, newRefresh)
}
```

**실제 탐지:**

| 시점 | 이벤트 |
|---|---|
| T+0 | 정상 사용자 로그인, RT-1 발급 (familyId=F1) |
| T+30분 | 정상 갱신: RT-1 사용 → RT-2 발급, RT-1 markUsed |
| T+45분 | **공격자가 RT-1 재사용** → reuse 탐지 |
| T+45분 | F1 전체 무효화 — RT-2도 죽음, 강제 로그아웃 |

**Race Condition 처리 (정상 사용자 여러 탭):**
- 갱신 후 짧은 grace window(5초) 동안 *동일 응답 반환*
- BroadcastChannel API로 탭 간 새 토큰 공유

**저장 위치 — XSS 방어:**
- 브라우저: HttpOnly + Secure + SameSite=Strict 쿠키
- LocalStorage 절대 금지

**결과:**
- 탈취 의심 12건 모두 *자동 차단 + 정상 사용자 강제 재로그인*
- 보안 사고 보고서 0건 (3개월)

**교훈:**
- Token Rotation은 *완벽한 탈취 방지*가 아니라 *피해 최소화* 메커니즘
- Family 개념이 정상 사용자와 공격자 모두 차단하는 *명확성*의 핵심
- false positive 발생 시 *grace window + 사용자 친화 UX* 필요

</details>

### 🔄 꼬리질문 1: 정상 사용자와 탈취자를 어떻게 구분하나요?

**기대 답변:**
- 같은 refresh token이 두 번 사용되면 둘 중 하나는 탈취
- 어느 쪽이 정상인지 알 수 없으므로 **양쪽 모두 무효화**가 안전
- 디바이스 fingerprint(브라우저·IP·OS)로 보조 판단 가능하지만 결정적 증거 아님

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** Refresh token 재사용 탐지로 *12명의 탈취 의심*을 잡았는데, "둘 중 누가 진짜 사용자인지"를 판별하려 *디바이스 fingerprint·IP로 정상 추정*을 시도했다가 *오히려 공격자를 정상으로 오판*할 뻔함.

**진단:**
- 같은 RT가 두 번 사용 = *둘 중 하나는 탈취자*인데, 어느 쪽이 진짜인지 *확정할 방법이 없음*
- fingerprint·IP는 *위조 가능* → 보조 신호일 뿐 결정적 증거 아님
- "정상을 골라내려다" 공격자를 통과시키는 위험

**조치 — 모호하면 양쪽 모두 차단:**
- 누가 정상인지 *판별하려 하지 않고*, **토큰 패밀리 전체를 무효화 + 양쪽 모두 강제 로그아웃**
- 정상 사용자는 *다시 로그인하면 끝* (불편하지만 안전), 공격자는 *새 인증 불가*
- fingerprint는 *사후 분석·알림*용으로만 활용 (차단 판단엔 안 씀)

**결과:**
- 12건 모두 안전 처리 (공격자 통과 0)
- 정상 사용자는 재로그인 한 번의 불편만

**교훈:** Refresh token 재사용 시 *"누가 정상인지" 판별하려 들면 공격자를 통과시킬 위험*이 있다. **모호하면 보수적으로 — 양쪽 모두 무효화**가 안전하다. 정상 사용자의 재로그인 불편 < 공격자 통과 위험. fingerprint는 *보조 신호*일 뿐 차단 근거가 못 된다.

</details>

### 🔄 꼬리질문 2: Rotation 도입 후 UX 영향은?

**기대 답변:**
- 정상 사용자도 약간의 race(여러 탭에서 동시 갱신)로 강제 로그아웃 가능
- 완화: 갱신 후 짧은 grace 윈도우 동안 구 토큰 허용
- 동일 토큰 동시 요청은 첫 응답을 다른 탭에 공유(BroadcastChannel)

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** Token Rotation 도입 직후, *정상 사용자의 강제 로그아웃이 일 30건* 발생. 조사해보니 탈취가 아니라 *여러 탭을 열어둔 사용자*가 피해자였음.

**진단 — 멀티 탭 동시 갱신 race:**
- 사용자가 탭 3개를 열어둠 → access token이 동시에 만료
- 3개 탭이 *동시에 같은 RT로 갱신 요청* → 첫 요청은 성공(RT 소비), 나머지 2개는 *"이미 사용된 RT"로 탐지* → reuse로 오인 → 강제 로그아웃
- 정상 사용자를 *공격자로 오판*

**조치 — Grace Window + 탭 동기화:**
- 갱신 후 *짧은 grace window(5초)* 동안 *구 RT 재사용을 허용* (같은 응답 반환) → 멀티 탭 race 흡수
- **BroadcastChannel API**로 *한 탭이 갱신한 새 토큰을 다른 탭에 공유* → 애초에 중복 갱신 안 하게

**결과:**
- 정상 사용자 강제 로그아웃 일 30건 → 0건
- 보안(탈취 차단)은 그대로 유지 (grace window는 5초로 짧음)

**교훈:** Token Rotation은 *멀티 탭 동시 갱신*을 탈취로 오인해 정상 사용자를 쫓아낸다. **Grace window(짧게) + BroadcastChannel(탭 간 토큰 공유)** 로 race를 흡수해야 한다. 보안 강화는 *UX false positive*까지 챙겨야 사용자가 떠나지 않는다.

</details>

### 🔄 꼬리질문 3: Refresh Token을 어디에 저장하나요?

**기대 답변:**
- 브라우저: **HttpOnly + Secure + SameSite=Strict** 쿠키
- 모바일: Keychain(iOS) / EncryptedSharedPreferences(Android)
- LocalStorage는 XSS에 노출되므로 금지

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 레거시 SPA가 *Refresh Token을 LocalStorage*에 저장. 어느 날 *서드파티 분석 스크립트의 공급망 공격(XSS)* 으로 LocalStorage가 읽혀 *다수 사용자 토큰이 탈취*되는 보안 사고.

**진단 — LocalStorage는 XSS에 무방비:**
- LocalStorage는 *JavaScript로 자유롭게 읽힘* → XSS 한 번이면 토큰 전부 노출
- 서드파티 스크립트(분석·광고)가 *같은 출처에서 실행*되면 LocalStorage 접근 가능
- 토큰이 *오래 유효한 Refresh Token*이라 피해가 큼

**조치 — HttpOnly 쿠키로 이전:**
- Refresh Token을 **HttpOnly + Secure + SameSite=Strict 쿠키**로 저장 → *JavaScript에서 읽기 불가*(XSS 무력화)
- CSRF는 SameSite=Strict + CSRF 토큰으로 방어
- 모바일은 *Keychain/EncryptedSharedPreferences* (OS 보안 저장소)
- 사고 토큰 전체 로테이션 + Rotation 도입

**결과:**
- XSS로 토큰을 읽을 수 없게 됨 (HttpOnly)
- 이후 유사 공급망 공격에도 토큰 안전

**교훈:** **LocalStorage 토큰은 XSS 한 번이면 전부 털린다** (JS로 읽힘). Refresh Token은 *HttpOnly + Secure + SameSite 쿠키*(JS 접근 불가)에 두어야 XSS를 무력화한다. 모바일은 OS 보안 저장소. "편하다고 LocalStorage"는 보안 부채.

</details>

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
- Refresh 호출 부하 24배 증가
- 단점이 너무 큼

**옵션 2 — Blacklist 도입 (JWT 유지):**
- 차단된 토큰 ID를 Redis Set에 보관
- 모든 API에서 blacklist 조회 → *stateless 이점 사라짐*

**옵션 3 — Session 회귀 (선택):**
- Redis 클러스터에 세션 저장
- 차단 시 세션 한 키 삭제로 즉시 무효화

**Session + 로컬 캐시 최적화:**
```kotlin
// 1) 로컬 캐시 (Caffeine, 30초)
var session = localCache.getIfPresent(sessionId)
// 2) Redis (캐시 미스)
if (session == null) {
  session = redisSessionStore.get(sessionId) ?: throw UnauthorizedException()
  localCache.put(sessionId, session)
}

// 차단 시 — Pub/Sub로 로컬 캐시 무효화 전파
fun banUser(userId: Long) {
  redisSessionStore.findByUserId(userId).forEach { redisSessionStore.delete(it.sessionId) }
  redisPubSub.publish("session.invalidated", ...)
}
```

**결과:**
- 악성 사용자 차단 시간: 24시간 → 평균 32초 (로컬 캐시 30초)
- Redis QPS: 12만, p99 0.5ms

**교훈:**
- JWT는 *완벽한 stateless*가 매력이지만 *권한 회수 불가*가 치명적인 도메인이 있음
- Session도 *로컬 캐시*로 Redis QPS를 견딜 수 있음
- 선택 기준은 **즉각 회수가 필요한가?** — 필요하면 Session

</details>

### 🔄 꼬리질문 1: 강제 로그아웃을 JWT로 어떻게 구현하나요?

**기대 답변:**
- 짧은 access token TTL (5~15분) + Refresh로 보완
- **Blacklist**: 무효화한 token id를 Redis에 TTL만큼 보관
- 모든 API에서 blacklist 조회 → stateless 이점 약해짐

→ 즉각 회수가 핵심이면 Session이 더 적합합니다.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** "JWT를 유지하면서 강제 로그아웃도 하자"며 *Blacklist*(차단 토큰 ID를 Redis에 저장, 모든 API가 조회)를 도입. 그런데 *모든 요청마다 Redis blacklist 조회*가 추가되어, "stateless라서 빠르다"던 JWT의 장점이 사실상 사라짐.

**진단:**
- JWT의 매력은 *서버 상태 조회 없이 토큰 자체로 검증*(stateless)
- Blacklist는 *매 요청마다 Redis 조회*를 강제 → Session과 *Redis 의존도가 똑같아짐*
- 결국 "JWT + Blacklist" = "Session인데 토큰 검증만 복잡한" 어정쩡한 구조

**조치 — 요구사항 재평가 후 Session 회귀:**
- *즉각 강제 로그아웃이 핵심 요구*라면, JWT를 억지로 유지할 이유가 없음을 인정
- Session(Redis) + 로컬 캐시(30초)로 전환 → 즉각 무효화 + Redis 부하는 캐시로 흡수
- JWT는 *권한 회수가 드문 외부 파트너 API*에만 한정 유지

**결과:**
- 강제 로그아웃 요구를 자연스럽게 충족 (세션 키 삭제)
- "JWT + Blacklist"의 어정쩡함 해소

**교훈:** JWT에 *대규모 Blacklist*를 붙이면 **매 요청 Redis 조회로 stateless 이점이 사라져 Session보다 나을 게 없다**. *즉각 강제 로그아웃이 핵심 요구*면 *JWT를 억지로 유지하지 말고 Session(Redis + 로컬 캐시)* 으로 가는 게 정직하다. 도구는 요구사항에 맞춰 고른다.

</details>

### 🔄 꼬리질문 2: JWT 페이로드에 뭘 넣어도 되나요?

**기대 답변:**
- 민감 정보 절대 금지 (signed지만 *encrypted*가 아님 — 누구나 디코드)
- 권한·역할 같은 정적 정보만
- 자주 변하는 정보는 매 갱신 시 다시 발급되도록

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 편의를 위해 JWT 페이로드에 *사용자 이메일·전화번호·생년월일*을 넣었음. 보안 점검에서 *"토큰만 디코드하면 PII가 그대로 노출된다"* 는 심각한 지적.

**진단 — JWT는 signed이지 encrypted가 아님:**
- JWT(JWS)는 *서명*으로 *위변조*는 막지만, 페이로드는 *Base64로 누구나 디코드* 가능
- 즉 *암호화가 아님* → 토큰을 가진 사람(또는 로그·프록시에 찍힌 토큰)은 PII를 그대로 봄
- GDPR/개인정보 관점에서 *PII 노출 사고*

**조치 — 최소 정보 원칙:**
- 페이로드에서 *PII 전부 제거* → `userId` + `role`(권한) 같은 *비민감 정적 정보만* 유지
- PII가 필요하면 *userId로 서버에서 조회* (토큰에 안 담음)
- 정말 토큰에 민감 정보를 담아야 하면 *JWE(암호화)* 사용 (드묾)

**결과:**
- 토큰 디코드로 PII 노출 0
- 보안 점검 통과

**교훈:** **JWT(JWS)는 서명이지 암호화가 아니다 — 페이로드는 누구나 디코드한다.** 이메일·전화번호 등 *PII를 절대 넣으면 안 된다*. `userId + role` 같은 *비민감 정적 정보만* 담고, 민감 정보는 *서버에서 userId로 조회*한다.

</details>

### 🔄 꼬리질문 3: 분산 환경에서 세션 일관성은?

**기대 답변:**
- **Sticky Session**: LB가 같은 서버로 라우팅 — 확장성 저하
- **Redis 클러스터 세션**: 일반적인 선택. p99 지연·만료 정책 관리
- **세션 복제**: 인스턴스 간 복제 — 노드 늘면 비용 폭증, 권장 안 함

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** Tomcat 내장 세션 + *세션 복제*(인스턴스 간 세션 동기화)로 운영하다가, 트래픽 증가로 *인스턴스를 3대 → 10대*로 늘리자 *세션 복제 트래픽이 폭증*해 네트워크가 마비, 오히려 응답이 느려짐.

**진단 — 세션 복제의 O(N²) 비용:**
- 세션 복제는 *모든 인스턴스가 서로의 세션을 동기화* → 노드 N개면 복제 트래픽이 *N² 비례*로 증가
- 10대가 되니 *복제 트래픽이 실제 서비스 트래픽을 초과*
- 확장할수록 *더 느려지는* 역설

**조치 — 외부 세션 스토어:**
- Tomcat 세션 복제 제거 → **Redis Cluster에 세션 저장** (Spring Session)
- 각 인스턴스는 *무상태* → 어느 인스턴스가 받아도 Redis 조회로 세션 확인
- Sticky Session도 불필요 (LB가 자유롭게 분산)
- Redis 부하는 *로컬 캐시(30초)* 로 흡수

**결과:**
- 세션 복제 트래픽 0 → 노드 확장이 선형적으로 동작
- 10대 → 30대로 확장해도 문제 없음

**교훈:** *세션 복제(인스턴스 간 동기화)는 노드 수에 O(N²)로 비용이 폭증*해 *확장할수록 느려진다*. 분산 환경의 세션은 **외부 스토어(Redis Cluster) + 무상태 인스턴스**가 정석. Sticky Session은 확장성을 해치고, 세션 복제는 소규모에서만 쓴다.

</details>

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

**기존 (TLS 1.2):** 2 RTT 핸드셰이크 = 600ms (3G 환경)

**개선 — TLS 1.3 + 운영 최적화:**

| 단계 | 핸드셰이크 시간 |
|---|---|
| TLS 1.2 (기존) | 600ms |
| TLS 1.3 | 300ms (1 RTT) |
| TLS 1.3 + OCSP Stapling | 250ms |
| TLS 1.3 + Session Resumption | 80ms (재방문) |
| HTTP/3 0-RTT | 20ms (재방문) |

**적용 항목:**
- `ssl_protocols TLSv1.3 TLSv1.2;`
- Session ticket (서버 간 공유 불필요)
- OCSP Stapling (`ssl_stapling on`)
- 인증서 체인 최적화 (1.2KB → 750B)

**0-RTT 보안:**
- 첫 패킷 데이터 동봉 가능 → *replay 공격* 위험
- 멱등 요청(GET)만 허용, 결제·인증은 0-RTT 거부

**결과:**
- 모바일 첫 페이지 로드: 1.8s → 1.1s
- 재방문 사용자 *체감 즉시*

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

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 대규모 API 게이트웨이 *여러 대*에서, 처음엔 *server-side session cache*로 TLS resumption을 구현. 그런데 LB가 사용자를 *다른 게이트웨이로 보내면 그 캐시가 없어* resumption 실패 → 풀 핸드셰이크 반복, CPU 부담.

**진단 — session cache는 서버 로컬:**
- session cache는 *각 서버 메모리에 저장* → 다른 서버로 가면 못 찾음
- 무상태 LB 분산 환경에선 *resumption 적중률이 낮음*

**조치 — Session Ticket으로 전환:**
- *session ticket*(암호화된 세션 상태를 *클라이언트가 보관*)으로 전환
- 모든 게이트웨이가 *공유 ticket key*로 복호화 → 어느 서버로 가도 resumption 성공
- ticket key는 *주기적 rotation*(1일)으로 보안 유지

**결과:**
- 재방문 핸드셰이크 *80ms로 단축*, 서버 CPU 25% 감소
- 어느 게이트웨이로 분산돼도 resumption 적중

**교훈:** Session Resumption은 *server-side cache(서버 로컬)* 와 *session ticket(클라이언트 보관)* 두 방식이 있다. **다중 서버·무상태 LB 환경에선 session cache는 적중률이 낮아, 공유 ticket key 기반 session ticket이 확장성에 유리**하다. ticket key는 주기적 rotation으로 보안 유지.

</details>

### 🔄 꼬리질문 2: OCSP Stapling이 뭔가요?

**기대 답변:**
- 인증서 폐기 여부 확인을 클라이언트가 매번 OCSP 서버에 묻지 않고, 서버가 미리 받아둔 응답을 핸드셰이크에 첨부
- 사용자 지연 감소 + CA OCSP 서버 부하 감소
- nginx `ssl_stapling on` 같은 옵션으로 활성화

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 모바일 사용자의 *첫 접속 핸드셰이크가 가끔 수백 ms 추가 지연*. 추적해보니 *클라이언트가 인증서 폐기 확인(OCSP)을 위해 CA OCSP 서버에 별도 요청*하는 시간이었고, *CA OCSP 서버가 느릴 때*는 더 심함.

**진단:**
- TLS 핸드셰이크 중 클라이언트가 *"이 인증서가 폐기 안 됐나?"* 를 *CA의 OCSP 서버에 직접 질의*
- 이 왕복이 *수백 ms* + CA OCSP 서버가 느리거나 장애면 *핸드셰이크 전체가 지연*
- 즉 *우리 서버는 빠른데 CA OCSP가 병목*

**조치 — OCSP Stapling:**
- nginx `ssl_stapling on; ssl_stapling_verify on;`
- 우리 서버가 *미리 OCSP 응답을 받아두고*, 핸드셰이크 시 *인증서와 함께 첨부(staple)*
- 클라이언트는 *CA에 별도 질의 없이* 첨부된 응답으로 폐기 확인 → 왕복 제거

**결과:**
- 첫 접속 핸드셰이크 *200ms 절감*
- CA OCSP 서버 장애와 *무관*하게 동작 (의존성 제거)

**교훈:** OCSP Stapling은 *인증서 폐기 확인을 클라이언트가 CA에 묻지 않고, 서버가 미리 받아 핸드셰이크에 첨부*하는 것이다. **사용자 지연 감소 + CA OCSP 서버 의존·장애 제거**. `ssl_stapling on`만 켜면 되는 *low-hanging fruit*인데 안 켜면 손해다.

</details>

### 🔄 꼬리질문 3: mTLS는 언제 도입하나요?

**기대 답변:**
- 서비스 간 통신에서 서로 신뢰가 필요할 때 (예: 사내 zero-trust)
- 결제·인증 같은 고신뢰 경계
- Service Mesh(Istio, Linkerd)가 자동 mTLS 제공 — 운영 비용 크게 절감

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 보안 감사에서 *"내부 서비스 간 통신이 암호화·인증되지 않아, 침입자가 내부망에 들어오면 서비스를 자유롭게 호출할 수 있다"* 는 zero-trust 지적. 모든 서비스에 mTLS를 *코드로* 넣자니 60개 서비스 작업량이 막대.

**진단:**
- 서비스 간 mTLS를 *각 서비스 코드*로 구현하면: 인증서 발급·배포·*회전*·검증 로직을 *60번* 작성·유지
- 일관성 보장도 어렵고 (한 서비스가 빠지면 구멍), 인증서 회전이 운영 지옥

**조치 — Service Mesh로 자동 mTLS:**
- **Linkerd** 사이드카 주입 → *모든 서비스 간 통신에 자동 mTLS*(암호화 + 상호 인증)
- 인증서 *발급·회전·검증을 Mesh가 전담* (코드 변경 0)
- 정책으로 *"인증된 서비스만 호출 허용"* zero-trust 강제

**결과:**
- 60개 서비스 *코드 변경 없이* 전부 mTLS 적용
- 인증서 회전 자동화 (운영 부담 0)
- 보안 감사 통과 (내부 zero-trust 입증)

**교훈:** mTLS를 *서비스마다 코드로* 구현하면 *인증서 발급·회전·검증의 운영 지옥*이다. **Service Mesh(Istio/Linkerd)가 자동 mTLS를 코드 변경 없이 제공**해 운영 비용을 거의 0으로 낮춘다. 사내 zero-trust·고신뢰 경계가 필요하면 Mesh가 정석이다.

</details>

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

allow {
  input.action == "read"
  input.resource.type == "document"
  input.resource.owner_id == input.user.id
}

allow {
  input.action == "read"
  input.resource.shared_with[_] == input.user.id
}
```

**2) 아키텍처 — PDP/PIP 분리:**
```
[Application] → check(user, action, resource)
[OPA Sidecar (PDP)] → fetch attrs
[PIP (User DB, Resource DB)]
```

**3) 캐싱 + 비트마스크:**
- 사용자별 권한 비트마스크 미리 계산 (READ=1, WRITE=2, DELETE=4)
- Redis 캐시 (TTL 5분), 조회 `(mask & required) == required`
- 평균 평가 0.3ms

**도입 전후:**

| 항목 | Before | After |
|---|---|---|
| 권한 추가 | 50개 파일 수정 | Rego 1개 수정 |
| 평가 시간 | 평균 8ms (DB) | 평균 0.3ms (캐시) |
| 정책 검토 | 코드 리뷰 분산 | Rego PR 한 곳 |

**위험:**
- OPA 사이드카 장애 시 인증 마비 → 로컬 fallback 정책 (기본 deny)

**결과:**
- 권한 관련 버그 70% 감소
- 신규 권한 도입 PR: 2일 → 4시간

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

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 권한 평가를 *Redis + 로컬 캐시(5분)* 로 최적화했는데, *관리자가 어떤 사용자의 권한을 박탈*해도 *최대 5분간 옛 권한*이 유지되어 *이미 박탈된 사용자가 결제 권한을 계속 행사*하는 위험.

**진단:**
- 캐시 TTL 5분 = *권한 변경이 최대 5분 늦게 반영*
- 일반 권한(문서 읽기)은 5분 지연이 무해하지만, *결제·환불 같은 민감 권한*은 즉시 회수 필요

**조치 — 도메인별 일관성 차등:**
- 일반 권한: *Redis + 로컬 캐시(5분)* 유지 (성능 우선)
- 정책 변경 시 **Kafka 이벤트 발행 → 모든 인스턴스가 즉시 로컬 캐시 무효화** (5초 내 반영)
- *결제·환불 등 강한 일관성 권한*은 *캐시 우회, 매번 PDP 직접 조회* (즉시 정확)

**결과:**
- 일반 권한은 캐시로 0.3ms 유지
- 민감 권한은 즉시 회수 (캐시 지연 0)
- 권한 박탈 후 결제 행사 사고 0건

**교훈:** 권한 캐시는 *도메인별 일관성 요구가 다르다*. **일반 권한은 캐시(TTL) + 정책 변경 시 Kafka 무효화, 민감 권한(결제)은 캐시 우회·매번 PDP 조회**. "캐시 TTL 하나로 전부"는 *민감 권한의 즉시 회수*를 놓친다.

</details>

### 🔄 꼬리질문 2: RBAC vs ABAC, 언제 어느 쪽?

**기대 답변:**
- **RBAC**: 역할 수가 적고 안정적일 때 (관리자/일반/게스트)
- **ABAC**: 리소스 상태나 컨텍스트가 권한에 영향 (소유자 본인만 수정 등)
- 실무에선 보통 RBAC + 일부 ABAC 정책 혼용

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** "표현력이 좋다"는 이유로 *처음부터 전면 ABAC*를 도입했다가, 단순한 "관리자/일반" 구분까지 *모든 권한을 속성 규칙으로* 작성하게 되어 *정책이 과도하게 복잡*해지고 신규 개발자가 이해 못 함.

**진단:**
- 우리 권한의 90%는 *단순 역할 기반*(관리자는 전부, 일반은 본인 것) → RBAC면 충분
- 10%만 *컨텍스트 의존*(문서 소유자 본인만 수정, 영업시간에만 등) → ABAC 필요
- 전면 ABAC는 *단순한 90%까지 복잡한 규칙*으로 만들어 오버엔지니어링

**조치 — RBAC 기본 + ABAC 선별:**
- 기본은 **RBAC**: 역할(admin/member/guest)로 대부분 처리 → 단순·이해 쉬움
- *컨텍스트가 권한에 영향*을 주는 케이스만 **ABAC 정책**으로 (소유자 본인 수정 등)
- 둘을 *혼용* (역할로 거른 뒤 속성으로 세밀화)

**결과:**
- 정책 복잡도 대폭 감소 (90%는 단순 RBAC)
- 신규 개발자도 권한 구조를 빠르게 이해
- 필요한 10%만 ABAC 표현력 활용

**교훈:** *전면 ABAC는 단순한 권한까지 복잡하게* 만드는 오버엔지니어링이다. **기본은 RBAC(역할), 컨텍스트가 권한을 좌우하는 케이스만 ABAC** 로 혼용한다. "표현력이 좋다"가 "항상 써야 한다"는 아니다 — 복잡도 비용을 고려한다.

</details>

### 🔄 꼬리질문 3: 정책 엔진 도구는 뭐가 있나요?

**기대 답변:**
- **OPA (Open Policy Agent)**: Rego DSL, 사이드카로 배포
- **Cedar (AWS)**: 검증 도구 강력, JSON 기반
- **Casbin**: 가벼운 RBAC/ABAC 라이브러리

도입 시 *정책 변경 빈도*와 *팀 학습 비용*을 같이 평가.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 초기 작은 서비스에서 권한 분리가 필요해 *"업계 표준"이라는 이유로 OPA*를 도입하려다, *Rego DSL 학습 곡선 + 사이드카 운영 부담*이 작은 팀에 과하다고 판단. 도구를 규모에 맞춰 재선택.

**판단 — 규모·변경 빈도로 도구 선택:**
- **초기·소규모**: *Casbin*(가벼운 라이브러리, 코드에 임베드, 별도 인프라 0) → 빠르게 시작
- **규모 성장 후**: 권한 정책이 복잡해지고 *보안팀이 직접 정책을 관리*해야 하자 → **OPA**(Rego, 사이드카, 정책을 코드에서 분리)로 마이그레이션
- *Cedar는 AWS 생태계 한정*이라 우리 환경엔 부적합

**결과:**
- 초기엔 Casbin으로 빠르게 권한 분리 (오버엔지니어링 회피)
- 규모 성장 시점에 OPA로 진화 (정책-코드 분리, 보안팀 검토 가능)

**교훈:** 정책 엔진도 *규모와 함께 진화*한다. **소규모는 Casbin(가벼운 임베드), 규모 성장·보안팀 정책 관리 필요 시 OPA(Rego, 정책 분리)**. Cedar는 AWS 한정. 도입 기준은 *정책 변경 빈도 + 팀 학습 비용*이고, 처음부터 무거운 도구는 오버엔지니어링이다.

</details>

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
