---
layout: post
emoji: 🚢
title: "시니어 백엔드 면접 질문 8편 - 플랫폼/배포 (5~10년차)"
date: '2026-06-09 12:30:00'
author: 손(Son/손민기)
tags: 백엔드 면접 시니어 쿠버네티스 Helm ArgoCD Distroless ZeroCopy GitOps 꼬리질문
categories: CS
series: "시니어 백엔드 면접 질문"
---

8편은 **플랫폼과 배포**입니다. 면접관은 도구 이름이 아니라 **무엇을 표준화했고 어떤 비용을 막았는지**를 봅니다.

**시리즈 구성:**
- 1~7편 (이전): 인프라 / 운영 / 설계 / 동시성 / 분산 / 가용성 / DB
- **8편 (현재)**: 플랫폼/배포
- 9편 (예정): 네트워크/보안
- 부록 (예정): 면접 마지막 5분 - 역질문 20선

---

## 1. Zero-Copy

### Q1. Zero-Copy가 무조건 빠른가요?

**기대 답변:**
아닙니다.
- 데이터를 *변환 없이 그대로* 전달할 때만 유효 (정적 파일 서빙, Kafka 브로커→컨슈머)
- 페이로드를 열어 가공해야 하면 의미 없음

대표 API: `sendfile`, `mmap`, `splice`. 커널이 디스크-네트워크 버퍼를 직결.

### 🔄 꼬리질문 1: sendfile과 mmap의 차이는?

**기대 답변:**
- **sendfile**: 파일→소켓 직접 전달, 유저 공간 거치지 않음
- **mmap**: 파일을 메모리에 매핑, 유저 공간에서 접근 가능. write 비용은 sendfile보다 큼

전송만 하면 sendfile, 일부 가공이 필요하면 mmap.

### 🔄 꼬리질문 2: Kafka는 어떻게 zero-copy를 활용하나요?

**기대 답변:**
- 브로커가 디스크 세그먼트를 `sendfile`로 직접 컨슈머 소켓에 전송
- 단, **TLS**가 켜지면 페이로드 암호화 때문에 zero-copy 불가 → 성능 저하
- 운영에서는 mTLS 강제 시 네트워크 처리량 30%+ 감소를 미리 예측

### 🔄 꼬리질문 3: 운영에서 zero-copy 효과를 어떻게 측정하나요?

**기대 답변:**
- CPU 사용률 vs 네트워크 처리량 비율
- `perf` system call profile (`read`/`write` 호출 비중)
- 컨테이너 memory cgroup의 page cache 활용도

---

## 2. Helm Base Chart 통합

### Q2. 사내 공통 base chart로 통합한 경험이 있나요?

**기대 답변:**
20여 개 흩어진 차트를 분석해 **85% 공통 추상화 + 15% Values 인터페이스**로 정리한 사례입니다.

3축:
1. **공통 템플릿 추상화**: deployment·service·ingress 표준
2. **Values 인터페이스 설계**: 서비스별 고유 설정 수용
3. **Dry-run + Diff** 기반 단계적 마이그레이션

### 🔄 꼬리질문 1: 공통화 비율은 어떻게 도출했나요?

**기대 답변:**
- 기존 차트 텍스트 diff로 동일 블록 추출
- 의존성 그래프(같은 리소스 종류 반복) 분석
- 80% 룰 → 85% 가능했던 이유: helper template과 includes로 미세 변형 흡수

### 🔄 꼬리질문 2: 표준 차트 버전 업 시 하위 호환성은?

**기대 답변:**
- **SemVer** 엄격 적용 (MAJOR 깰 때만)
- `values.schema.json`로 입력 검증
- Deprecate 정책: 한 MAJOR 동안 alias 유지
- CI 단계에서 `helm template` 결과를 이전 버전과 diff

### 🔄 꼬리질문 3: 왜 Kustomize가 아니라 Helm base chart인가요?

**기대 답변:**
- 패키징·릴리스 추적이 Helm 강점 (rollback, history)
- Kustomize는 오버레이 강점이지만 릴리스 단위 추적이 약함
- 사내 GitOps가 ArgoCD Application(Helm 친화)이라면 Helm 우선

둘은 혼합 가능 (Helm + Kustomize Post-render).

---

## 3. ArgoCD와 다중 환경 Drift

### Q3. 다중 환경 GitOps에서 Drift는 어떻게 막았나요?

**기대 답변:**
4축:
1. **수동 kubectl 차단**: RBAC + 운영 정책으로 직접 수정 금지
2. **Self-Heal**: ArgoCD가 상시 desired state로 자동 복구
3. **App-of-Apps**: 50여 개 서비스를 부모 Application으로 일괄 관리
4. **Kustomize 오버레이**: 환경별 차이 명시화

### 🔄 꼬리질문 1: 긴급 롤백 시 Git 반영 지연은 어떻게 푸나요?

**기대 답변:**
- 임시 우회 파이프라인: 직접 컨테이너 이미지 태그를 revert 후 ArgoCD sync
- 또는 Git revert PR을 봇이 자동 머지 (`/rollback` 명령)
- 사후에 정식 Git 흐름으로 정합성 회복

### 🔄 꼬리질문 2: Self-Heal이 위험할 수 있나요?

**기대 답변:**
네. 운영 중 의도된 임시 변경(예: HPA 수동 조정)이 되돌려질 수 있습니다.
- 임시 변경은 Application 단위 sync 일시 중단
- 변경 사항은 즉시 Git에 반영하는 원칙
- 알람: Drift 발생 시 알림(Self-Heal 전에 검토)

### 🔄 꼬리질문 3: Secret 관리는 어떻게 하나요?

**기대 답변:**
- **SealedSecret**: 클러스터 공개키로 암호화한 secret을 Git에
- **External Secrets Operator**: AWS Secrets Manager/Vault 동기화
- 절대 plain secret을 Git에 두지 않음 — pre-commit hook으로 검증

---

## 4. Distroless

### Q4. Distroless 도입의 트레이드오프는?

**기대 답변:**
3축:
1. **경량화**: 이미지 800MB → 90MB, 배포 속도 향상
2. **CVE 표면 감소**: 불필요한 시스템 패키지 제거
3. **디버깅 비용**: shell 없음 → ephemeral container로 대응

### 🔄 꼬리질문 1: Ephemeral Container 실행 시 보안 통제는?

**기대 답변:**
- RBAC: 운영자만 `pods/ephemeralcontainers` 권한
- Audit log에 누가·언제·어떤 이미지로 붙였는지 기록
- 디버그 이미지는 사내 허용 목록만 사용

### 🔄 꼬리질문 2: 정적 분석으로 CVE를 어떻게 관리하나요?

**기대 답변:**
- Trivy/Grype를 CI에 통합, CRITICAL은 머지 차단
- SBOM(Software Bill of Materials) 자동 생성
- 베이스 이미지 갱신 PR을 봇이 주기적으로 올림

### 🔄 꼬리질문 3: Distroless로 못 가는 케이스는?

**기대 답변:**
- shell 기반 init script가 필수인 레거시
- glibc 의존성 문제로 일부 native 라이브러리가 동작 안 함 (musl 차이)
- 빌드 도구(JDK toolchain 등)가 런타임에 필요한 경우

→ 빌드 스테이지는 fat 이미지, 런타임 스테이지만 distroless가 일반적.

---

## 5. PR Preview 환경 자동화

### Q5. PR마다 임시 환경을 자동 프로비저닝하려면?

**기대 답변:**
3축:
1. **PR 번호 기반 Namespace** 생성 및 격리
2. **공통 의존성**(DB·캐시) 연동 전략 — 스테이징 공유 or 격리
3. **TTL 7일** 후 namespace 자동 삭제 (CronJob)

리뷰어가 즉시 동작을 확인하고, 비용은 자동 회수.

### 🔄 꼬리질문 1: DB 스키마 변경 PR은 어떻게 처리하나요?

**기대 답변:**
- 격리 옵션: PR별 별도 DB 인스턴스 또는 Postgres `CREATE DATABASE pr_123`
- 스키마 마이그레이션은 PR 생성 시 자동 적용 (`flyway migrate`)
- 마이그레이션 실패는 PR check 실패로 노출

### 🔄 꼬리질문 2: 트래픽은 어떻게 라우팅하나요?

**기대 답변:**
- 와일드카드 DNS: `pr-123.preview.example.com`
- Ingress controller가 호스트 헤더로 namespace 라우팅
- 인증은 사내 SSO + IP 화이트리스트

### 🔄 꼬리질문 3: 외부 의존성(결제·메일)은?

**기대 답변:**
- 외부 호출은 sandbox 또는 mock으로 자동 전환 (env 변수)
- Webhook은 ngrok 같은 터널 또는 사내 stub 서버로 받음
- 실제 결제는 절대 호출 안 되도록 정책 + 코드 가드

---

## 마무리: 8편 핵심 정리

1. **Zero-Copy**: 적용 범위(정적 서빙·Kafka)와 TLS 영향
2. **Helm Base Chart**: 85% 공통화 + Values 인터페이스 + Dry-run·Diff
3. **ArgoCD**: 수동 차단 + Self-Heal + App-of-Apps
4. **Distroless**: 경량·CVE 감소 + ephemeral container 운영
5. **PR Preview**: namespace 격리 + TTL 자동 정리

다음 9편은 **네트워크/보안** — DNS TTL, Refresh Token Rotation, JWT vs Session, TLS Handshake를 다룹니다.

```toc
```
