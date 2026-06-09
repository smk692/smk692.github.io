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

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** Kafka 브로커 5대, 일 1억 메시지. 보안 강화로 *클라이언트-브로커 간 mTLS 도입* 후 처리량 30% 감소, CPU 70%로 폭증.

**원인 분석:**
- 평소 Kafka는 디스크 SSTable → 소켓으로 `sendfile()` 직접 전달 (zero-copy)
- mTLS 켜면 페이로드 *암호화 필요* → 유저 공간으로 가져와야 함
- zero-copy 경로 완전히 우회, CPU가 암호화 작업 수행

**측정 (`perf stat`):**
```
zero-copy ON:
  sendfile() 호출 수: 12,000/s
  context-switches: 8,000/s
  CPU per message: 0.8μs

mTLS ON (zero-copy 우회):
  sendfile() 호출 수: 0
  context-switches: 34,000/s
  CPU per message: 4.2μs  (5.3배 증가)
```

**대응 옵션 검토:**

| 옵션 | 장점 | 단점 |
|---|---|---|
| **mTLS 유지** | 보안 강함 | CPU 비용 영구화 |
| **내부망 mTLS 제거** | zero-copy 회복 | 보안 의존성 (VPC 신뢰) |
| **하드웨어 가속** | CPU 회복 | 인스턴스 비용 |
| **TLS offload (sidecar)** | 브로커는 zero-copy 유지 | 운영 복잡도 |

**최종 결정:**
- 브로커 ↔ 컨슈머: mTLS 유지 (외부 노출)
- 브로커 ↔ 브로커: 내부망 + Network Policy 강화로 mTLS 제거
- 인스턴스 1단계 업그레이드 (c5.2xlarge → c5.4xlarge), 그래도 mTLS 이전보다 비용 적음

**결과:**
- 처리량 회복: 30% 감소 → 5% 감소만 남음
- CPU: 70% → 45%
- 브로커 간 처리는 sendfile 활용, 외부 통신만 암호화

**교훈:**
- Zero-Copy는 *암호화/변환 없는 단순 전달*에서만 의미
- mTLS 도입 시 *처리량 영향 사전 예측*이 필수 (보안만 보면 안 됨)
- 보안과 성능의 트레이드오프는 *위치별 차등 정책*으로 해결

</details>

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

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 마이크로서비스 23개 × 환경 4개(dev/stg/prod/canary) = 92개 차트가 각각 다른 구조. 신규 서비스마다 2~3일 작업, 보안 패치 적용에 1주 소요.

**1단계 — 기존 차트 분석 (2주):**
- 23개 차트 텍스트 diff 후 공통 블록 추출
- 결과: 85%가 *거의 동일* (deployment template, service, ServiceMonitor, HPA, NetworkPolicy)
- 15% 변동: probe 경로, ConfigMap 키, 외부 의존성 환경변수

**2단계 — Base Chart 설계 (3주):**
```yaml
# base-chart/values.yaml (기본값)
image:
  repository: ""
  tag: ""
  pullPolicy: IfNotPresent

replicas: 2

resources:
  requests: { cpu: 100m, memory: 256Mi }
  limits: { cpu: 1000m, memory: 1Gi }

probes:
  liveness:
    path: /actuator/health/liveness
    initialDelaySeconds: 30
  readiness:
    path: /actuator/health/readiness
    initialDelaySeconds: 10

autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 10
  targetCPU: 70

# values.schema.json으로 입력 검증
```

**서비스 차트는 base를 의존:**
```yaml
# my-service/Chart.yaml
dependencies:
  - name: base-chart
    version: "1.0.0"
    repository: "@internal"

# my-service/values.yaml — 차이만 override
image:
  repository: my-service
probes:
  liveness:
    path: /health  # actuator 안 쓰는 경우
```

**3단계 — 마이그레이션 (4주):**
- Dry-run으로 *기존 manifest*와 *base chart 결과* diff
- 1개 서비스씩 카나리 전환 (10% → 50% → 100%)
- 첫 5개 서비스는 매뉴얼 검증, 이후 자동화 스크립트

**예상 못 한 함정:**
- 일부 레거시 서비스가 *비표준 annotation*(예: `linkerd.io/inject`) 사용
- 처음엔 *외면*하려 했으나 추적 불가 → base chart에 `extraAnnotations` 인터페이스 추가
- 정밀도 vs 유연성의 절충

**결과:**
- 신규 서비스 추가: 2~3일 → 30분
- 보안 패치 적용: 1주 → 1시간 (base chart 버전만 올림)
- 차트 코드 라인: 12,000줄 → 3,500줄 (71% 감소)

**추가 — 하위 호환성 정책:**
- SemVer 엄격: MAJOR 변경 시 1개 분기 deprecation 기간
- `values.schema.json`로 입력 검증, CI에서 차단

**교훈:**
- 통합 전 *기존 차트 정밀 분석*이 절반 (어디까지 공통화 가능한지)
- *모든 케이스를 포용*하려 하면 base chart가 복잡해짐 — 80% 케이스만 표준화
- Helm 차트 통합은 *플랫폼 팀의 가장 큰 레버리지*

</details>

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

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** 야간 P1 대응 중 운영자가 `kubectl edit deployment`로 replicas를 일시적으로 20으로 올림. 다음 날 ArgoCD가 자동 복구하면서 다시 5로 되돌림 → *부하 못 견디고 또 다운*.

**근본 문제:**
- 긴급 변경이 Git에 반영 안 됨 → ArgoCD의 desired state와 어긋남
- Self-Heal이 의도된 임시 변경을 *되돌려버림*

**개선 전략:**

**1단계 — Drift 가시화:**
```bash
argocd app diff my-service
```
- Drift 감지 시 Slack 알림 (Self-Heal 실행 전)
- 운영팀이 "이게 의도된 거였나" 확인할 시간 확보

**2단계 — App-of-Apps 패턴:**
```yaml
# bootstrap/values.yaml
applications:
  - name: payment
    repoURL: ...
    syncPolicy:
      automated:
        prune: true
        selfHeal: true
      syncOptions:
        - ApplyOutOfSyncOnly=true
  - name: notification
    ...
```
- 부모 Application 1개가 50개 자식 Application 관리
- 새 서비스 추가 시 Git 한 줄

**3단계 — Kustomize 환경별 오버레이:**
```
base/
  deployment.yaml (replicas: 2)
overlays/
  dev/
  stg/
  prod/ (replicas: 5)
  canary/ (replicas: 1, weight: 10)
```

**4단계 — 긴급 우회 프로세스:**
- `kubectl` 직접 차단 (RBAC)
- 긴급 시 `/emergency-override` Slack 명령 → 봇이 자동 PR + 자동 머지 + ArgoCD sync
- 30초 안에 적용 가능, 추적도 됨

**5단계 — Self-Heal 안전망:**
- 긴급 PR 머지되기 전엔 *해당 Application만 Self-Heal 일시 중단*
- Sync window로 야간엔 Self-Heal off (운영 작업 보호)

**결과:**
- Drift 사고 → 0건 (3개월)
- 긴급 대응 시간: 5분 → 30초
- 운영팀이 "ArgoCD 때문에 어쩔 줄 모르겠다"는 불평 사라짐

**Secret 관리 동반:**
- SealedSecret으로 암호화된 secret을 Git에
- External Secrets Operator로 AWS Secrets Manager 자동 동기화
- plain secret이 Git에 들어가지 않게 pre-commit hook으로 차단

**교훈:**
- GitOps의 가장 큰 함정은 *긴급 대응을 막아버리는 것*
- 우회 프로세스가 *Git 흐름과 통합*되어야 운영자가 따름
- Self-Heal은 *알람 → 검토 → 적용* 3단으로 운용

</details>

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

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** Spring Boot 50개 서비스, 이미지 평균 850MB. 보안팀 스캔에서 베이스 이미지(`openjdk:17`) CVE 287건 검출. 배포 속도도 느려 카나리 한 라운드 25분.

**Distroless 전환 (Multi-stage build):**

```dockerfile
# Build stage — fat 이미지
FROM eclipse-temurin:21-jdk AS builder
WORKDIR /app
COPY . .
RUN ./gradlew bootJar

# Runtime stage — distroless
FROM gcr.io/distroless/java21-debian12:nonroot
WORKDIR /app
COPY --from=builder /app/build/libs/*.jar app.jar
USER nonroot
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

**측정 결과:**

| 항목 | Before | After |
|---|---|---|
| 이미지 크기 | 850MB | 92MB |
| CVE 수 (CRITICAL+HIGH) | 287 | 8 |
| 컨테이너 시작 시간 | 8.2s | 3.1s |
| 카나리 라운드 | 25분 | 9분 |
| 레지스트리 비용 | $$$$ | $$ |

**Ephemeral Container로 디버깅:**
```bash
# shell이 없으니 ephemeral debug 컨테이너 붙임
kubectl debug -it pod/my-service-xxx \
  --image=busybox \
  --target=app \
  --share-processes
```
- 같은 PID namespace에 합류 → `ps`, `netstat` 등 실행 가능
- 평소엔 distroless 유지, 필요할 때만 임시 진단

**보안 통제 강화:**
- `pods/ephemeralcontainers` RBAC 권한 = 운영자만
- Audit log에 누가·언제·어떤 이미지로 ephemeral 했는지 기록
- 사내 허용 디버그 이미지 목록만 사용 가능 (OPA Gatekeeper)

**예상 못 한 호환성 문제:**
- 일부 native 라이브러리가 glibc 가정 → distroless `static` 이미지로는 안 됨
- 해결: distroless `cc-debian12`(glibc 포함) 사용
- 한 서비스는 결국 alpine 유지 (musl libc 호환성)

**CI 강화:**
- Trivy로 빌드마다 스캔, CRITICAL 검출 시 PR 차단
- SBOM 자동 생성, 운영팀이 *어떤 라이브러리가 어디에 있는지* 즉시 추적

**결과:**
- 6개월 후: CVE 0건 유지, 이미지 평균 95MB
- 배포 파이프라인 속도 2.8배 빨라짐
- 컨테이너 보안 점수 (CIS) 등급 상향

**교훈:**
- Distroless는 *베이스 이미지 변경*이 아니라 **운영 문화 변경**
- Ephemeral container 도입이 *디버깅 비용*을 해소하는 핵심
- 100% distroless가 목표는 아님 — 어떤 서비스는 alpine 그대로가 답

</details>

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

<details>
<summary>💡 <b>실제 사례 보기</b></summary>

<br/>

**시나리오:** PR Preview env 도입 6개월 후, 클러스터에 *방치된 namespace 800개*. 노드 자원의 40%를 좀비가 차지.

**기존 흐름의 함정:**
- PR 생성 → namespace 생성 ✅
- PR 리뷰 → 임시 환경 확인 ✅
- PR 머지 또는 close → namespace 정리 ❌ (안 됨)
- 작성자가 PR을 close 안 하고 *그냥 두는* 케이스가 30%

**문제 진단:**
- 노드 80%에 unused namespace 리소스 점유
- 신규 PR이 *Pending* 상태로 대기 (자원 부족)
- 월 클라우드 비용 12% 초과

**개선 — 3단 정리 정책:**

**1) PR 라이프사이클 기반 정리:**
```yaml
# GitHub Action — PR close 시
- name: Cleanup preview env
  if: github.event.action == 'closed'
  run: |
    kubectl delete namespace pr-${{ github.event.number }}
```

**2) TTL 라벨 + CronJob (안전망):**
```yaml
# namespace 생성 시 라벨
metadata:
  labels:
    preview-env: "true"
    created-by: "pr-bot"
  annotations:
    expires-at: "2026-06-15T00:00:00Z"  # 7일 후

---
# CronJob — 매시간 만료된 namespace 삭제
apiVersion: batch/v1
kind: CronJob
metadata:
  name: preview-env-gc
spec:
  schedule: "0 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: gc
            image: bitnami/kubectl
            command:
              - /bin/sh
              - -c
              - |
                kubectl get ns -l preview-env=true -o json | \
                jq -r '.items[] | select(.metadata.annotations."expires-at" < (now | todateiso8601)) | .metadata.name' | \
                xargs -r kubectl delete ns
```

**3) PR 활동 기반 갱신:**
- PR에 새 커밋 → expires-at 7일 후로 연장
- 7일간 무활동 → 자동 정리
- 정리 24시간 전 PR에 코멘트 자동 알림

**DB·외부 의존성:**
- 일반 PR: 스테이징 DB 공유 (스키마 변경 없는 PR)
- 스키마 변경 PR: 별도 RDS 인스턴스 자동 프로비저닝 (Terraform)
- 외부 결제·메일은 sandbox 자동 전환 (env 변수)

**트래픽 라우팅:**
- 와일드카드 DNS: `*.preview.example.com`
- Ingress controller가 호스트 헤더로 namespace 매핑
- 사내 SSO + IP 화이트리스트로 외부 접근 차단

**결과:**
- 클러스터 unused namespace: 800 → 평균 35
- 신규 PR Pending 시간: 평균 12분 → 30초
- 월 비용: 12% 초과 → -8% (오히려 절감)
- 운영 부담 0 (자동화)

**교훈:**
- *생성만 자동화하면 좀비가 쌓임* → **정리까지 자동화**가 필수
- 다중 안전망 (PR 이벤트 + TTL + CronJob)이 안정적
- 사용자에게 정리 24시간 전 알림이 *학습 효과* 큼

</details>

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
