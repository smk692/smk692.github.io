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
