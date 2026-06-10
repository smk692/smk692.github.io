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

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 정적 자산(이미지·동영상) 서빙 서버의 CPU가 35%로 높았음. 단순히 *파일을 읽어 소켓에 쓰는* 작업인데 CPU를 많이 씀.

**진단:**
- 기존 코드가 *파일 → 유저 공간 버퍼 read → 소켓 write* (전통적 4-copy 경로)
- 파일 내용을 *가공하지 않고 그대로 전송*하는데 유저 공간을 거치는 게 낭비

**조치 — 작업 성격에 맞는 API:**
- *순수 전송*(정적 자산)은 nginx `sendfile on` → 커널이 *파일→소켓 직결*, 유저 공간 우회
- *부분 가공*이 필요한 동영상 트랜스코딩 입력은 `mmap`으로 메모리 매핑 후 처리

**결과:**
- 정적 서빙 CPU 35% → 12% (sendfile zero-copy)
- 가공 필요한 부분만 mmap으로 유연성 확보

**교훈:** **순수 전송이면 `sendfile`(유저 공간 우회), 부분 가공이 필요하면 `mmap`(매핑 후 접근)**. 둘 다 zero-copy 계열이지만 *가공 필요 여부*가 선택 기준이다. 그냥 전송에 유저 공간 버퍼를 거치면 CPU 낭비.

</details>

### 🔄 꼬리질문 2: Kafka는 어떻게 zero-copy를 활용하나요?

**기대 답변:**
- 브로커가 디스크 세그먼트를 `sendfile`로 직접 컨슈머 소켓에 전송
- 단, **TLS**가 켜지면 페이로드 암호화 때문에 zero-copy 불가 → 성능 저하
- 운영에서는 mTLS 강제 시 네트워크 처리량 30%+ 감소를 미리 예측

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 보안팀이 *"모든 Kafka 통신에 mTLS 의무화"* 를 공지. 운영팀은 "그냥 설정 켜면 되는 것"으로 가볍게 생각하고 적용하려 함.

**진단 — 사전 부하 테스트:**
- 적용 전 *스테이징에서 부하 테스트* → mTLS 켜자 컨슈머 throughput *30% 감소* 확인
- 원인: Kafka는 평소 *디스크 세그먼트를 `sendfile`로 컨슈머에 직결*하는데, mTLS는 *페이로드 암호화* 때문에 그 경로를 우회 → CPU 부담
- 그냥 켰으면 *운영에서 기습 처리량 저하 + 컨슈머 lag 폭증*이 났을 상황

**조치:**
- 처리량 30% 감소를 *사전 capacity 계획*에 반영 → 브로커 인스턴스 1단계 업그레이드
- 외부 노출 구간만 mTLS, *내부 브로커 간*은 Network Policy로 대체해 zero-copy 유지

**결과:**
- mTLS 적용 후에도 *기습 lag·처리량 저하 0* (사전 대비)
- 보안 요구 충족 + 성능 영향 최소화

**교훈:** Kafka의 zero-copy(`sendfile`)는 *TLS를 켜면 페이로드 암호화 때문에 우회*되어 처리량이 30%+ 떨어진다. **보안 변경(mTLS)은 반드시 사전 부하 테스트로 성능 영향을 측정**하고 capacity에 반영해야 한다. "설정만 켜면 됨"이 아니다.

</details>

### 🔄 꼬리질문 3: 운영에서 zero-copy 효과를 어떻게 측정하나요?

**기대 답변:**
- CPU 사용률 vs 네트워크 처리량 비율
- `perf` system call profile (`read`/`write` 호출 비중)
- 컨테이너 memory cgroup의 page cache 활용도

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** "zero-copy가 정말 동작하는지" 확신이 없어, mTLS 도입 후 *체감상 느려진 게 진짜 zero-copy 우회 때문인지* 검증이 필요했음.

**조치 — syscall 카운트로 직접 검증:**
```bash
# sendfile 호출 수 측정
perf stat -e syscalls:sys_enter_sendfile -p <broker_pid> sleep 10
```
- mTLS *적용 전*: `sendfile` 12,000/s (zero-copy 활성)
- mTLS *적용 후*: `sendfile` **0** (완전히 우회됨)
- 동시에 `context-switches`가 8천 → 3.4만/s로 증가 (유저 공간 경유 증거)

**결과:**
- "체감"이 아니라 *syscall 카운트로 zero-copy 우회를 객관 입증*
- 데이터로 capacity 의사결정 근거 마련

**교훈:** zero-copy 효과는 *체감이 아니라 측정*으로 확인한다. **`perf stat -e syscalls:sys_enter_sendfile`** 로 sendfile 호출 수를 직접 세면, zero-copy 활성/우회를 객관적으로 입증할 수 있다. context-switch 증가도 유저 공간 경유의 증거다.

</details>

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
    path: /health
```

**3단계 — 마이그레이션 (4주):**
- Dry-run으로 *기존 manifest*와 *base chart 결과* diff
- 1개 서비스씩 카나리 전환 (10% → 50% → 100%)

**예상 못 한 함정:**
- 일부 레거시가 *비표준 annotation* 사용 → base chart에 `extraAnnotations` 인터페이스 추가

**결과:**
- 신규 서비스 추가: 2~3일 → 30분
- 보안 패치 적용: 1주 → 1시간 (base chart 버전만 올림)
- 차트 코드 라인: 12,000줄 → 3,500줄 (71% 감소)

**교훈:**
- 통합 전 *기존 차트 정밀 분석*이 절반
- *모든 케이스를 포용*하려 하면 base chart가 복잡해짐 — 80% 케이스만 표준화
- Helm 차트 통합은 *플랫폼 팀의 가장 큰 레버리지*

</details>

### 🔄 꼬리질문 1: 공통화 비율은 어떻게 도출했나요?

**기대 답변:**
- 기존 차트 텍스트 diff로 동일 블록 추출
- 의존성 그래프(같은 리소스 종류 반복) 분석
- 80% 룰 → 85% 가능했던 이유: helper template과 includes로 미세 변형 흡수

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** "차트를 통합하자"는 합의는 됐는데, *어디까지 공통화 가능한지를 감으로* 추정하려다 의견이 갈림 ("절반쯤?", "거의 다?").

**조치 — 측정으로 공통화 비율 도출:**
- 23개 차트를 *텍스트 diff 자동화 스크립트*로 비교 → *완전히 동일한 블록*을 추출
- 결과: deployment·service·HPA·NetworkPolicy 등 *80%가 동일*
- 나머지 미세 변형(probe 경로, 환경변수 키)은 *helper template + includes*로 흡수 → 최종 85% 공통화 가능 판정
- 변동 15%만 *Values 인터페이스*로 노출

**결과:**
- "감"이 아니라 *측정 근거*로 base chart 설계 범위 확정
- 85% 공통화 + 15% Values로 통합 성공

**교훈:** 공통화 비율은 *감이 아니라 측정*으로 도출한다. **차트 텍스트 diff로 동일 블록을 정량 추출**하면 "어디까지 공통화 가능한지"가 객관적으로 나온다. 미세 변형은 helper template으로 흡수해 공통화율을 높인다.

</details>

### 🔄 꼬리질문 2: 표준 차트 버전 업 시 하위 호환성은?

**기대 답변:**
- **SemVer** 엄격 적용 (MAJOR 깰 때만)
- `values.schema.json`로 입력 검증
- Deprecate 정책: 한 MAJOR 동안 alias 유지
- CI 단계에서 `helm template` 결과를 이전 버전과 diff

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** base chart의 values 구조를 개선하려고 *키 이름을 변경*(MINOR 버전 업으로)했더니, 그 base를 의존하던 *23개 서비스 중 8개가 다음 배포에서 깨짐*. "공통 차트 하나 바꿨는데 8개 서비스 장애".

**진단:**
- base chart는 *23개 서비스의 공통 의존성* → 변경 영향이 거대
- values 키 변경은 *하위 호환을 깨는 MAJOR 변경*인데 MINOR로 올림 → 의존 서비스들이 무방비
- 검증 없이 배포되어 깨짐

**조치 — 애플리케이션 의존성처럼 관리:**
- base chart에 **SemVer 엄격 적용** — 하위 호환 깨면 *반드시 MAJOR*
- MAJOR 변경 시 *기존 키 alias를 1분기 유지*(deprecation 기간) → 점진 마이그레이션
- `values.schema.json`로 입력 검증
- **CI에서 `helm template` 결과를 이전 버전과 diff** → 의도치 않은 변경 자동 탐지

**결과:**
- 이후 base chart 변경으로 인한 의존 서비스 장애 0건
- 점진 마이그레이션으로 안전하게 버전 업

**교훈:** 공통 base chart는 *수십 서비스의 의존성*이므로 **애플리케이션 라이브러리와 동일한 호환성 정책(SemVer + deprecation + CI diff)** 이 필요하다. 하위 호환을 깨는 변경을 MINOR로 올리면 *의존 서비스가 무더기로 깨진다*.

</details>

### 🔄 꼬리질문 3: 왜 Kustomize가 아니라 Helm base chart인가요?

**기대 답변:**
- 패키징·릴리스 추적이 Helm 강점 (rollback, history)
- Kustomize는 오버레이 강점이지만 릴리스 단위 추적이 약함
- 사내 GitOps가 ArgoCD Application(Helm 친화)이라면 Helm 우선

둘은 혼합 가능 (Helm + Kustomize Post-render).

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 표준화 도구로 Helm이냐 Kustomize냐 팀 내 논쟁. "Kustomize가 더 단순하다"는 의견과 "Helm이 릴리스 관리에 낫다"는 의견 충돌.

**판단 — 요구사항으로 결정:**
- 핵심 요구: *릴리스 버전 추적 + 원클릭 rollback + history*
- **Helm**: `helm rollback`, release history, 차트 버전 관리 → 요구 충족
- **Kustomize**: 환경별 오버레이는 강력하나 *릴리스 단위 추적·rollback이 약함*
- 사내 GitOps가 *ArgoCD Application(Helm 친화)* → Helm이 정합

**조치 — 둘의 장점 결합:**
- *공통 구조·릴리스 관리*는 **Helm base chart**
- *환경별(dev/stg/prod) 미세 오버라이드*는 **Kustomize post-render**로 Helm 출력을 덮어씀
- "대립"이 아니라 *역할 분담*으로 둘 다 활용

**결과:**
- 릴리스 추적·rollback(Helm) + 환경 오버레이(Kustomize) 양쪽 이점 확보
- 도구 논쟁 종결 (ADR로 기록)

**교훈:** Helm vs Kustomize는 *대립이 아니라 강점이 다른 도구*다. **Helm = 패키징·릴리스 추적·rollback, Kustomize = 환경별 오버레이**. 릴리스 관리가 중요하고 ArgoCD(Helm 친화) 환경이면 Helm 우선이고, *Helm + Kustomize post-render*로 둘을 조합할 수 있다.

</details>

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

**2단계 — App-of-Apps 패턴:**
- 부모 Application 1개가 50개 자식 Application 관리
- 새 서비스 추가 시 Git 한 줄

**3단계 — Kustomize 환경별 오버레이**

**4단계 — 긴급 우회 프로세스:**
- `kubectl` 직접 차단 (RBAC)
- 긴급 시 `/emergency-override` Slack 명령 → 봇이 자동 PR + 자동 머지 + ArgoCD sync
- 30초 안에 적용, 추적도 됨

**5단계 — Self-Heal 안전망:**
- 긴급 PR 머지 전엔 *해당 Application만 Self-Heal 일시 중단*
- Sync window로 야간엔 Self-Heal off

**결과:**
- Drift 사고 → 0건 (3개월)
- 긴급 대응 시간: 5분 → 30초

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

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** GitOps 도입 후, 운영자들이 *"긴급한데 PR 만들고 리뷰 받고 머지 기다리는 게 너무 느리다"* 며 *몰래 `kubectl`로 직접 수정*하기 시작 → Drift 발생 + Self-Heal과 충돌.

**진단:**
- GitOps가 *긴급 대응을 느리게* 만들어 운영자가 우회 → Git이 진실의 원천이 아니게 됨
- "정석 프로세스"가 *긴급 상황에 비현실적*이면 사람들이 안 따름

**조치 — 긴급 우회를 Git 흐름 안에서 자동화:**
- Slack `/rollback v1.2.3` 명령 → 봇이 *Git revert PR 자동 생성 → 자동 머지 → ArgoCD sync*
- 전체 30초, 그러나 *Git 이력은 보존* (추적 가능)
- 긴급 상황에도 *Git이 진실의 원천* 유지

**결과:**
- 긴급 대응 5분 → 30초 (운영자가 우회할 이유 사라짐)
- `kubectl` 직접 수정 Drift 0건

**교훈:** GitOps의 가장 큰 함정은 *긴급 대응을 느리게 만들어 사람들이 우회하는 것*이다. **긴급 롤백을 Git 흐름 안에서 자동화**(봇이 revert PR 자동 머지 + sync)하면, *빠르면서도 추적 가능*해 운영자가 우회할 이유가 없어진다.

</details>

### 🔄 꼬리질문 2: Self-Heal이 위험할 수 있나요?

**기대 답변:**
네. 운영 중 의도된 임시 변경(예: HPA 수동 조정)이 되돌려질 수 있습니다.
- 임시 변경은 Application 단위 sync 일시 중단
- 변경 사항은 즉시 Git에 반영하는 원칙
- 알람: Drift 발생 시 알림(Self-Heal 전에 검토)

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 야간 트래픽 급증 대응으로 운영자가 *replicas를 5→20으로 수동 확장*. 그런데 ArgoCD Self-Heal이 *Git의 desired state(5)로 자동 복구* → 20→5로 되돌림 → *부하 못 견디고 2차 다운*.

**진단:**
- Self-Heal은 *Git에 없는 변경을 "drift"로 보고 자동 되돌림*
- 운영자의 *의도된 긴급 확장*을 Self-Heal이 "비정상"으로 판단해 무력화

**조치 — Self-Heal에 안전장치:**
- **Drift 감지 시 Self-Heal 전에 Slack 알림** → "이게 의도된 변경인가" 확인 시간
- 긴급 변경 시 *해당 Application만 Self-Heal 일시 중단* + *즉시 Git에 반영*(PR)
- *야간 Sync window*로 운영 작업 시간대엔 Self-Heal off

**결과:**
- 의도된 긴급 변경이 되돌려지는 사고 0건
- Self-Heal 이점(drift 자동 복구)은 평상시 유지

**교훈:** Self-Heal은 *의도된 긴급 변경까지 되돌려* 2차 장애를 만들 수 있다. **(1) Drift 시 Self-Heal 전 알람, (2) 긴급 변경 즉시 Git 반영, (3) 운영 시간대 Sync window**로 운용한다. Self-Heal은 *알람 → 검토 → 적용* 3단으로 길들여야 한다.

</details>

### 🔄 꼬리질문 3: Secret 관리는 어떻게 하나요?

**기대 답변:**
- **SealedSecret**: 클러스터 공개키로 암호화한 secret을 Git에
- **External Secrets Operator**: AWS Secrets Manager/Vault 동기화
- 절대 plain secret을 Git에 두지 않음 — pre-commit hook으로 검증

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** GitOps 전환 초기에 한 개발자가 *DB 비밀번호를 평문으로 manifest에 넣어* Git에 커밋. 코드 리뷰에서 놓쳐 *공개 저장소 히스토리에 secret이 영구 박힘* → 비밀번호 전체 로테이션 + git history purge 대응.

**진단:**
- GitOps는 *모든 것을 Git에* 두는데, secret도 무심코 평문으로 들어감
- Git history는 *지워도 fork·clone에 남아* 완전 제거가 어려움

**조치 — Secret을 Git 밖으로:**
- **External Secrets Operator** + AWS Secrets Manager → manifest엔 *secret reference만*, 실제 값은 외부 저장소에서 주입
- 회전 시 자동 동기화 (코드 변경 0)
- **pre-commit hook(gitleaks/trufflehog)** 으로 *평문 secret 패턴 자동 차단* (커밋 자체를 막음)

**결과:**
- 이후 평문 secret 커밋 0건 (hook이 차단)
- secret 회전이 자동화 (Git 안 건드림)

**교훈:** GitOps에서 *secret을 평문으로 Git에 두면 history에 영구 박힌다*. **External Secrets Operator(값은 외부, Git엔 reference만) + pre-commit hook(평문 차단)** 이 정석. SealedSecret(암호화해서 Git에)도 옵션. 핵심은 *평문 secret이 Git에 절대 안 들어가게* 다층 방어.

</details>

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

**Ephemeral Container로 디버깅:**
```bash
kubectl debug -it pod/my-service-xxx \
  --image=busybox --target=app --share-processes
```
- 같은 PID namespace에 합류 → `ps`, `netstat` 등 실행
- 평소엔 distroless 유지, 필요할 때만 임시 진단

**예상 못 한 호환성 문제:**
- 일부 native 라이브러리가 glibc 가정 → distroless `cc-debian12`(glibc 포함) 사용
- 한 서비스는 결국 alpine 유지 (musl libc 호환성)

**결과:**
- 6개월 후: CVE 0건 유지, 이미지 평균 95MB
- 배포 파이프라인 속도 2.8배

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

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** Distroless 도입으로 shell이 없어지자, 개발자들이 디버깅을 위해 *아무 이미지나(임의의 외부 busybox·netshoot)* ephemeral container로 붙이기 시작. 보안팀이 *"검증 안 된 이미지가 prod 파드에 붙는다"* 고 우려.

**진단:**
- `kubectl debug`로 *임의 이미지*를 prod 파드에 주입 가능 → 검증 안 된 이미지가 *prod 네임스페이스·PID에 접근*
- 누가 언제 어떤 이미지로 붙였는지 *추적도 안 됨*

**조치 — 디버깅 권한을 추적 가능하게:**
- **RBAC**: `pods/ephemeralcontainers` 권한을 *운영자 역할에만* 부여
- **OPA Gatekeeper**: ephemeral container 이미지를 *사내 허용 목록(검증된 디버그 이미지)* 으로 제한
- **Audit log → SIEM**: 누가·언제·어떤 이미지로 붙였는지 전송

**결과:**
- 검증 안 된 이미지 주입 차단
- 모든 디버깅 행위가 *추적 가능*해져 보안 감사 통과

**교훈:** Distroless 디버깅(ephemeral container)은 *편의*와 *보안*의 트레이드오프다. **RBAC(권한) + OPA(허용 이미지 제한) + Audit log(추적)** 로 *디버깅 권한을 추적 가능하게* 묶어야 한다. "shell 없으니 아무 이미지나"는 새로운 보안 구멍.

</details>

### 🔄 꼬리질문 2: 정적 분석으로 CVE를 어떻게 관리하나요?

**기대 답변:**
- Trivy/Grype를 CI에 통합, CRITICAL은 머지 차단
- SBOM(Software Bill of Materials) 자동 생성
- 베이스 이미지 갱신 PR을 봇이 주기적으로 올림

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** Distroless로 CVE를 줄였지만, *베이스 이미지·라이브러리는 시간이 지나면 새 CVE가 발견*됨. 처음엔 *분기마다 수동으로* 이미지를 갱신했는데, 그 사이 *심각한 CVE가 90일간 방치*되는 위험.

**진단:**
- "한 번 distroless로 줄였다"고 끝이 아님 → CVE는 *계속 새로 발견*
- 수동 분기 갱신은 *노출 윈도우(최대 90일)* 가 너무 김

**조치 — CVE 관리 자동화:**
- **Trivy를 CI에 통합** → 빌드마다 스캔, *CRITICAL 검출 시 머지 차단*
- **Renovate 봇**이 *베이스 이미지 새 버전 PR을 매주 자동 생성* → Trivy 통과해야 머지
- **SBOM 자동 생성** → "어떤 라이브러리가 어디 있는지" 즉시 추적 (신규 CVE 공시 시 영향 파악)

**결과:**
- CVE 노출 윈도우: 90일 → 7일
- 새 CVE 공시 시 *SBOM으로 영향 서비스 즉시 식별*

**교훈:** Distroless는 *CVE를 한 번 줄이는 것*이고, **CVE 관리는 지속적 자동화**가 필요하다. **Trivy CI 통합(CRITICAL 차단) + Renovate(주간 자동 갱신 PR) + SBOM(영향 추적)** 이 *노출 윈도우를 최소화*한다. "한 번 줄였으니 끝"이 아니다.

</details>

### 🔄 꼬리질문 3: Distroless로 못 가는 케이스는?

**기대 답변:**
- shell 기반 init script가 필수인 레거시
- glibc 의존성 문제로 일부 native 라이브러리가 동작 안 함 (musl 차이)
- 빌드 도구(JDK toolchain 등)가 런타임에 필요한 경우

→ 빌드 스테이지는 fat 이미지, 런타임 스테이지만 distroless가 일반적.

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** "전 서비스 100% distroless"를 목표로 밀어붙였는데, 한 레거시 결제 모듈이 *distroless 전환 후 부팅 실패*. 무리하게 맞추려다 시간만 낭비.

**진단:**
- 그 모듈은 *bash 기반 entrypoint 스크립트*(환경 변수 조립·사전 점검)에 의존 → distroless엔 shell이 없어 실행 불가
- 또 일부 native 라이브러리가 *glibc 가정* → distroless `static` 이미지(musl)와 비호환

**조치 — 현실적 절충:**
- 그 레거시 모듈은 *alpine 유지* (또는 distroless `cc-debian12` glibc 포함 버전 시도)
- 나머지 50개는 distroless
- "100% distroless"가 아니라 *"가능한 곳만"* 으로 목표 수정

**결과:**
- 50개 distroless로 보안·경량 이점 확보
- 레거시 1개는 alpine으로 안정 운영 (무리한 전환 회피)

**교훈:** *"100% distroless"는 목표가 아니다*. **shell 기반 init script·glibc 의존 native 라이브러리·런타임 빌드 도구**가 필요하면 distroless로 못 간다. 빌드 스테이지는 fat, 런타임만 distroless가 일반적이고, *안 되는 레거시는 alpine으로 두는 현실적 절충*이 옳다.

</details>

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
- PR 머지/close → namespace 정리 ❌ (작성자가 close 안 하면 영영 남음, 30% 케이스)

**문제 진단:**
- 노드 80%에 unused namespace 점유
- 신규 PR이 *Pending* 대기 (자원 부족)
- 월 클라우드 비용 12% 초과

**개선 — 3단 정리 정책:**

**1) PR 라이프사이클 기반 정리:**
```yaml
- name: Cleanup preview env
  if: github.event.action == 'closed'
  run: kubectl delete namespace pr-${{ github.event.number }}
```

**2) TTL 라벨 + CronJob (안전망):**
```yaml
metadata:
  labels: { preview-env: "true" }
  annotations: { expires-at: "2026-06-15T00:00:00Z" }
---
# CronJob — 매시간 만료된 namespace 삭제
schedule: "0 * * * *"
# kubectl get ns -l preview-env=true → expires-at 지난 것 삭제
```

**3) PR 활동 기반 갱신:**
- 새 커밋 → expires-at 7일 연장
- 7일 무활동 → 자동 정리 (24시간 전 PR 코멘트 알림)

**DB·외부 의존성:**
- 일반 PR: 스테이징 DB 공유 / 스키마 변경 PR: 별도 RDS 자동 프로비저닝
- 외부 결제·메일은 sandbox 자동 전환

**결과:**
- unused namespace: 800 → 평균 35
- 신규 PR Pending: 평균 12분 → 30초
- 월 비용: 12% 초과 → -8%

**교훈:**
- *생성만 자동화하면 좀비가 쌓임* → **정리까지 자동화**가 필수
- 다중 안전망 (PR 이벤트 + TTL + CronJob)이 안정적

</details>

### 🔄 꼬리질문 1: DB 스키마 변경 PR은 어떻게 처리하나요?

**기대 답변:**
- 격리 옵션: PR별 별도 DB 인스턴스 또는 Postgres `CREATE DATABASE pr_123`
- 스키마 마이그레이션은 PR 생성 시 자동 적용 (`flyway migrate`)
- 마이그레이션 실패는 PR check 실패로 노출

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** 처음엔 PR Preview들이 *스테이징 DB를 공유*. 그런데 *스키마 변경 PR*이 스테이징 DB에 마이그레이션을 적용하자, *다른 PR Preview들이 전부 깨지는* 사고 (공유 DB가 한 PR 변경에 오염).

**진단:**
- 스키마 변경 PR이 *공유 DB 스키마를 바꿈* → 그 변경과 호환 안 되는 다른 PR들이 깨짐
- 공유 자원에 *파괴적 변경*을 가하는 케이스를 격리 안 함

**조치 — 스키마 변경 PR만 DB 격리:**
- 일반 PR(스키마 변경 없음): 스테이징 DB 공유 (비용 절감)
- *스키마 변경 PR*: `CREATE DATABASE pr_${PR_NUM}` 으로 *전용 DB 자동 생성* + `flyway migrate` 자동 적용
- 마이그레이션 실패 시 *PR check fail*로 노출 (머지 전 차단)

**결과:**
- 스키마 변경 PR이 다른 PR을 깨는 사고 0건
- 일반 PR은 여전히 공유 DB로 비용 효율

**교훈:** PR Preview의 *공유 DB는 스키마 변경 PR에 오염*된다. **스키마 변경이 있는 PR만 전용 DB로 격리**(`CREATE DATABASE pr_N` + 자동 마이그레이션)하고, 일반 PR은 공유로 비용을 아낀다. 마이그레이션 실패는 *PR check로 사전 차단*한다.

</details>

### 🔄 꼬리질문 2: 트래픽은 어떻게 라우팅하나요?

**기대 답변:**
- 와일드카드 DNS: `pr-123.preview.example.com`
- Ingress controller가 호스트 헤더로 namespace 라우팅
- 인증은 사내 SSO + IP 화이트리스트

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** PR마다 환경은 떴는데, 리뷰어가 *어떻게 접속하는지*가 문제. PR별로 *수동으로 포트포워딩*하거나 IP를 찾아야 해서 *리뷰어가 귀찮아 안 들어가 봄* → Preview env가 무용지물.

**진단:**
- 접속 방법이 *번거로우면(포트포워딩·IP 찾기)* 리뷰어가 안 씀 → 환경만 뜨고 가치 0
- 외부 노출은 *보안 위험*도 있음

**조치 — 와일드카드 DNS + Ingress:**
- `*.preview.example.com` *와일드카드 DNS* 설정
- nginx Ingress가 *호스트 헤더(`pr-123.preview.example.com`)로 해당 namespace에 라우팅*
- 리뷰어는 *PR 코멘트에 자동으로 달리는 링크* 클릭만 하면 접속
- 보안: *사내 SSO + IP 화이트리스트*로 외부 차단

**결과:**
- 리뷰어가 *클릭 한 번*으로 접속 → Preview env 활용도 급증
- 외부 노출 없이 안전

**교훈:** PR Preview는 *접속이 번거로우면 아무도 안 쓴다*. **와일드카드 DNS + Ingress 호스트 헤더 라우팅**으로 *PR 코멘트의 링크 클릭만으로 접속*되게 해야 가치가 산다. 보안은 *SSO + IP 화이트리스트*로 외부를 막는다.

</details>

### 🔄 꼬리질문 3: 외부 의존성(결제·메일)은?

**기대 답변:**
- 외부 호출은 sandbox 또는 mock으로 자동 전환 (env 변수)
- Webhook은 ngrok 같은 터널 또는 사내 stub 서버로 받음
- 실제 결제는 절대 호출 안 되도록 정책 + 코드 가드

<details>
<summary>📋 <b>실제 사례</b></summary>

<br/>

**상황:** PR Preview 환경에서 결제 테스트를 하다가, *환경변수 설정 실수로 실제 PG사 운영 엔드포인트*가 호출되어 *진짜 결제가 발생*할 뻔한 아찔한 사고 (다행히 PG sandbox 키라 실패).

**진단:**
- Preview 환경이 *실제 외부 엔드포인트*를 가리킬 수 있는 구조 → 결제·메일이 진짜로 나갈 위험
- "설정 실수 한 번"이 *실제 결제·고객 메일 발송*으로 이어질 수 있음

**조치 — 다층 가드:**
- env `ENV=preview`면 *PG·메일·SMS를 sandbox/mock으로 자동 전환* (코드 레벨)
- Webhook은 *사내 stub 서버*로 받음 (외부 콜백 차단)
- **OPA/pre-commit hook**으로 *실제 결제 URL이 preview manifest에 하드코딩되는 것 자체를 차단*
- "실제 결제 절대 불가"를 *코드 + 정책 + 인프라* 다층으로

**결과:**
- 실제 결제·메일 발송 사고 0건
- 설정 실수가 있어도 *여러 가드 중 하나가 막음*

**교훈:** PR Preview에서 *외부 의존성(결제·메일)이 실제로 나가면 돌이킬 수 없다*. **env 기반 sandbox 자동 전환 + Webhook stub + 실제 URL 하드코딩 차단(OPA/hook)** 의 *다층 가드*가 필요하다. "설정 실수 한 번"이 실제 결제가 되지 않도록 단일 방어에 의존하지 않는다.

</details>

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
