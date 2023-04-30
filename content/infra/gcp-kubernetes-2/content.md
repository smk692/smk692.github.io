---
layout: post
emoji: ☸️
title: "☸️ Kubernetes 배포가 Google Cloud Platform에서 쉬움 모드 Step2 : 초보자를 위한 단계별 실습"
date: '2023-04-30 14:49:25'
author: 손(Son/손민기)
tags: 쿠버네티스 구글 클라우드 플랫폼 컨테이너화 클라우드 컴퓨팅 배포 마이크로서비스 확장성 도커 데브옵스 클라우드 네이티브 오케스트레이션 클라우드 관리 코드로서의 인프라 지속적인 통합 지속적인 배포 고가용성 로드 밸런싱 모니터링 자동화 보안 구성 관리 하이브리드 클라우드 멀티클라우드 자원 할당 서비스 디스커버리 스테이트풀 애플리케이션 쿠버네티스 클러스터 클라우드 아키텍처 클라우드 마이그레이션 클라우드 배포 Kubernetes Google Cloud Platform Containerization Cloud Computing Deployment Microservices Scalability Docker DevOps Cloud Native Orchestration Cloud Management Infrastructure as Code Continuous Integration Continuous Deployment High Availability Load Balancing Monitoring Automation Security Configuration Management Hybrid Cloud Multi-Cloud Resource Allocation Service Discovery Stateful Applications Kubernetes Cluster Cloud Architecture Cloud Migration Cloud Deployment
categories: 인프라
---

## 🔖 서론
> 만드는법은 이전글을 참고 해주세요.
>
> 이번에는 간단하게 쿠버네티스 실습 하려고합니다.
> - https://github.com/smk692/kubernetes-summarize
>
> 코드는 위의 링크에 있으며 간단한 실습 내용이라 안되는 부분은 댓글로 부탁드리겠습니다.

## 🖋️ 실습 GCP Kubernetes Engine Pod 생성 및 수정

### 시작 전 테스트 ```kubectl get pod``` 명령어 시 에러가 날 경우 이전 블로그 글을 확인해주세요.

### 1. git clone 을 진행해주세요.
 
      git clone https://github.com/smk692/kubernetes-summarize.git

준비물: deployment.yaml 

      apiVersion: apps/v1
      kind: Deployment
      metadata:
      name: nginx
      spec:
      selector:
      matchLabels:
            app: nginx
      replicas: 3
      template:
      metadata:
            labels:
            app: nginx
      spec:
            containers:
            - name: nginx
            image: nginx:1.21.1
            ports:
            - containerPort: 80
            resources:
            limits:
                  memory: "64Mi"
                  cpu: "50m"

### 2. 디렉토리 위치 변경 

```sh
cd kubernetes-summarize/step1
```
      
### 3. pod 생성
```sh
kubectl apply -f deployment.yaml

kubectl get deployment
```
![gcp-kube1](gcp-kube1.png)

<br/>

**GCP Kubernetes Engine 잘 생성된걸 확인 할 수 있습니다.**

![gcp-kube2](gcp-kube2.png)

스크린샷과 같이 뜨면 Pod 생성이 완료!

### 4. pod 변경
```sh
kubectl get deployment

NAME    READY   UP-TO-DATE   AVAILABLE   AGE
nginx   3/3     3            3           6m33s

```
위에서 확인한 Name 으로 변경을 진행합니다.

```sh
kubectl edit deployment nginx
```
![gcp-kube2](gcp-kube3.png)

저장 시 ```deployment.apps/nginx edited``` 수정이되었다고 호출됩니다.

![gcp-kube2](gcp-kube4.png)

스크린샷과 같이 뜨면 Pod 변경이 완료!

---

### 5. pod 삭제

```sh
kubectl get pod

NAME                     READY   STATUS    RESTARTS   AGE
nginx-57858cd857-c8j25   1/1     Running   0          46m

kubectl delete pod nginx-57858cd857-c8j25

pod "nginx-57858cd857-c8j25" deleted # 실행되면서 삭제 된다.

kubectl get pod # 다시 확인하면 아래와 같이 새로 뜹니다.

NAME                     READY   STATUS              RESTARTS   AGE
nginx-57858cd857-mj5vz   0/1     ContainerCreating   0          2s
```

> **yaml 에서 이미 replicas 지정했기 때문에 삭제되어도 새로운 pod 가 뜨는걸 확인 할 수 있습니다.**

<br/>

## 🖊️ 실습 GCP Kubernetes Engine port-forward 테스트

> 포트포워딩은 기본적으로 실무에서는 많이 사용되지는 않고 개발에서 테스트용으로 많이 사용합니다. 

      # pod 조회
      kubectl get pod 
      
      NAME                     READY   STATUS    RESTARTS   AGE 
      nginx-57858cd857-c8j25   1/1     Running   0          16m


      kubectl port-forward nginx-57858cd857-c8j25 8080:80


위에는 냅두고 이제 다른 터미널으로 아래와 같은 명령어를 날리면 잘 조회 되는것을 알 수 있다.

```sh
curl localhost:8080/version

<html>
<head><title>404 Not Found</title></head>
<body>
<center><h1>404 Not Found</h1></center>
<hr><center>nginx/1.21.1</center>
</body>
</html>
```

# 📚 Kubernetes 로그 보는 방법

```sh
# 실행중인 포드를 접근하여 실시간 로그 확인 
kubectl attach deployment/nginx -c nginx

# 실행중인 포드를 접근하여 전체 및 실시간 로그 확인 
kubectl logs deployment/nginx -c nginx -f
```

![gcp-kube2](gcp-kube5.png)

```toc

```