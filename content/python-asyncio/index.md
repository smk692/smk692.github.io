---
layout: post
emoji: 🎓
title: "Python asyncio 기초"
date: "2026-05-24 17:25:27"
author: 손(Son/손민기)
tags: "asyncio asyncawait Python 비동기처리 이벤트루프 코루틴 gather 동시성 비동기프로그래밍 IObound 백엔드개발 HTTP호출 DB드라이버 메시지큐 병렬호출"
categories: Python
readingTime: 6
---

## 핵심 개념 (왜 필요한가)

`asyncio`는 **대기 시간이 긴 작업을 겹쳐서 처리**할 때 강력하다. 특히 HTTP 호출, DB 드라이버, 메시지 큐처럼 CPU보다 **I/O 대기**가 많은 백엔드 작업에서 요청 처리량을 높이는 데 유용하다.  
실무에서는 “빠른 코드”라기보다, **같은 시간에 더 많은 대기 작업을 처리하는 방식**으로 이해하면 가장 정확하다.

## 기본 사용법

`asyncio`의 핵심은 `async def`, `await`, 그리고 이벤트 루프다. `await`는 시간이 걸리는 작업이 끝날 때까지 **스레드를 붙잡지 않고** 다른 코루틴에 실행 기회를 넘긴다.

```python
import asyncio
import time

async def fetch(name: str, delay: int) -> str:
    print(f"{name} 시작")
    await asyncio.sleep(delay)
    print(f"{name} 완료")
    return f"{name} 결과"

async def main():
    start = time.perf_counter()

    results = await asyncio.gather(
        fetch("A", 2),
        fetch("B", 1),
        fetch("C", 3),
    )

    elapsed = time.perf_counter() - start
    print("결과:", results)
    print(f"총 소요 시간: {elapsed:.2f}초")

if __name__ == "__main__":
    asyncio.run(main())
```

실행해보면 2초 + 1초 + 3초가 아니라, **가장 오래 걸린 3초 정도**만 걸린다.  
이게 `asyncio`의 가장 중요한 포인트다. 순차 처리 대신 **동시 대기**를 만든다.

`gather()`는 여러 코루틴을 한 번에 실행하고 결과를 순서대로 모아준다. 백엔드에서 외부 API 여러 개를 병렬 호출할 때 자주 쓴다.

## 실전 예제

실무에서 흔한 패턴은 “여러 API를 동시에 호출하되, 실패를 안전하게 처리”하는 형태다. 아래 예시는 외부 서비스 호출을 흉내 낸 코드다.

```python
import asyncio
import random

async def call_api(user_id: int) -> dict:
    await asyncio.sleep(random.uniform(0.5, 1.5))

    if user_id == 3:
        raise RuntimeError("외부 API 오류")

    return {"user_id": user_id, "status": "ok"}

async def safe_call(user_id: int) -> dict:
    try:
        result = await call_api(user_id)
        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "user_id": user_id, "error": str(e)}

async def main():
    user_ids = [1, 2, 3, 4, 5]

    tasks = [safe_call(user_id) for user_id in user_ids]
    results = await asyncio.gather(*tasks)

    success_count = sum(1 for r in results if r["success"])
    fail_count = len(results) - success_count

    print("처리 결과")
    for r in results:
        print(r)

    print(f"성공: {success_count}, 실패: {fail_count}")

if __name__ == "__main__":
    asyncio.run(main())
```

현업에서는 `gather()`에 코루틴을 바로 넘기기도 하지만, **예외 전파 전략을 먼저 정하는 것**이 중요하다.  
한 작업의 실패가 전체 실패여야 하는지, 아니면 부분 성공을 허용할지에 따라 구현이 달라진다. 개인적으로 외부 API 집계 서비스에서는 `safe_call()`처럼 **실패를 결과 객체로 바꾸는 패턴**을 자주 사용했다.

동시성 제한도 자주 필요하다. 외부 API나 DB 커넥션은 무한정 동시에 호출하면 오히려 장애를 만든다.

```python
import asyncio

semaphore = asyncio.Semaphore(2)

async def limited_task(name: str, delay: int):
    async with semaphore:
        print(f"{name} 시작")
        await asyncio.sleep(delay)
        print(f"{name} 완료")

async def main():
    await asyncio.gather(
        limited_task("task-1", 2),
        limited_task("task-2", 2),
        limited_task("task-3", 2),
        limited_task("task-4", 2),
    )

if __name__ == "__main__":
    asyncio.run(main())
```

위 코드는 한 번에 2개씩만 실행된다. 실서비스에서 트래픽이 튀는 순간, 이런 제한 하나가 장애 예방에 꽤 큰 차이를 만든다.

## 주의사항

### 1. CPU 바운드 작업에는 큰 효과가 없다
`asyncio`는 이미지 처리, 압축, 복잡한 계산처럼 CPU를 오래 쓰는 작업에는 적합하지 않다. 그런 경우는 멀티프로세싱이나 작업 큐를 고려하는 편이 낫다.

### 2. `time.sleep()`를 쓰면 이벤트 루프가 멈춘다
비동기 함수 안에서 `time.sleep()`를 쓰면 전체가 막힌다. 반드시 `await asyncio.sleep()`를 사용해야 한다.

### 3. 아무 라이브러리나 비동기로 바뀌지 않는다
함수에 `async`만 붙인다고 빨라지지 않는다. HTTP 클라이언트, DB 드라이버도 **비동기 지원 라이브러리**여야 한다. 예: `aiohttp`, `httpx.AsyncClient`, async DB 드라이버.

### 4. 너무 많은 태스크 생성은 위험하다
수천, 수만 개 코루틴을 한 번에 만들면 메모리 사용량과 외부 시스템 부하가 커진다. `Semaphore`나 배치 처리로 상한을 두는 게 안전하다.

### 5. 예외 처리를 빼먹기 쉽다
`gather()`는 기본적으로 하나의 예외가 전체 흐름에 영향을 줄 수 있다. 운영 환경에서는 로깅, 타임아웃, 재시도 정책까지 같이 설계해야 한다.

## 정리

- `asyncio`는 I/O 대기 시간이 많은 작업에서 효율적이다.
- 핵심 도구는 `async def`, `await`, `asyncio.run()`, `asyncio.gather()`다.
- 외부 API, DB, 메시지 큐 처리에서는 동시성 제한이 중요하다.
- `time.sleep()` 같은 동기 코드를 섞으면 비동기의 장점이 사라진다.
- 실패 전략과 타임아웃 설계가 실무 품질을 좌우한다.

다음 단계로는 `asyncio.create_task()`, `asyncio.wait_for()`를 이용한 타임아웃 처리, 그리고 `aiohttp`나 `httpx`로 실제 HTTP 비동기 클라이언트를 다뤄보면 좋다.

```toc
```