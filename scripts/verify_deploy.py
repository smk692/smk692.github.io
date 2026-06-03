#!/usr/bin/env python3
"""
블로그 배포 확인 스크립트
- 메인 페이지 접근 가능 여부
- 최근 포스트 존재 여부
- 특정 포스트 URL 확인
"""

import sys
import time
import json
import re
import requests
from pathlib import Path
from datetime import datetime

BLOG_URL = "https://smk692.github.io"
TIMEOUT = 10
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds
DEPLOY_WAIT = 30  # GitHub Pages 배포 반영 대기 시간


def check_url(url: str, retries: int = MAX_RETRIES) -> dict:
    """URL 접근 가능 여부 확인"""
    for attempt in range(retries):
        try:
            response = requests.get(url, timeout=TIMEOUT)
            return {
                "url": url,
                "status": response.status_code,
                "ok": response.status_code == 200,
                "size": len(response.content),
            }
        except requests.RequestException as e:
            if attempt < retries - 1:
                time.sleep(RETRY_DELAY)
            else:
                return {
                    "url": url,
                    "status": 0,
                    "ok": False,
                    "error": str(e),
                }


def get_recent_posts_from_content() -> list:
    """content 디렉토리에서 최근 포스트 정보 가져오기"""
    content_dir = Path(__file__).parent.parent / "content"
    posts = []

    for md_file in content_dir.rglob("*.md"):
        content = md_file.read_text(encoding="utf-8")
        if content.startswith("---"):
            try:
                front = content.split("---")[1]
                post_info = {"file": str(md_file)}

                for line in front.split("\n"):
                    if line.startswith("date:"):
                        post_info["date"] = line.split(":", 1)[1].strip().strip("'\"")
                    elif line.startswith("categories:"):
                        post_info["category"] = line.split(":", 1)[1].strip()

                # 슬러그 추출 (파일명에서)
                slug = md_file.stem
                if slug == "index":
                    slug = md_file.parent.name
                post_info["slug"] = slug

                # URL 생성: /카테고리/슬러그/
                category = post_info.get("category", "")
                post_info["url"] = f"/{category}/{slug}/" if category else f"/{slug}/"

                posts.append(post_info)
            except:
                pass

    # 최근 순 정렬
    posts.sort(key=lambda x: x.get("date", ""), reverse=True)
    return posts[:5]


def verify_deployment(post_paths: list = None) -> dict:
    """배포 확인 실행"""
    results = {
        "timestamp": datetime.now().isoformat(),
        "blog_url": BLOG_URL,
        "checks": [],
        "success": True,
    }

    # 1. 메인 페이지 확인
    main_check = check_url(BLOG_URL)
    main_check["name"] = "메인 페이지"
    results["checks"].append(main_check)
    if not main_check["ok"]:
        results["success"] = False

    # 2. 특정 포스트 확인 (전달된 경우)
    if post_paths:
        for path in post_paths:
            # /로 시작하지 않으면 추가
            if not path.startswith("/"):
                path = f"/{path}"
            # /로 끝나지 않으면 추가
            if not path.endswith("/"):
                path = f"{path}/"

            post_check = check_url(f"{BLOG_URL}{path}")
            post_check["name"] = f"포스트: {path}"
            results["checks"].append(post_check)
            if not post_check["ok"]:
                results["success"] = False

    # 3. 최근 포스트 자동 확인 (인자가 없는 경우)
    if not post_paths:
        recent_posts = get_recent_posts_from_content()
        for post in recent_posts[:3]:  # 최근 3개만
            url = post.get("url", "")
            if url:
                post_check = check_url(f"{BLOG_URL}{url}")
                post_check["name"] = f"최근 포스트: {post.get('slug', 'unknown')}"
                results["checks"].append(post_check)
                if not post_check["ok"]:
                    results["success"] = False

    return results


def print_results(results: dict):
    """결과 출력"""
    print("\n" + "=" * 50)
    print("📡 블로그 배포 확인 결과")
    print("=" * 50)
    print(f"시간: {results['timestamp']}")
    print(f"URL: {results['blog_url']}")
    print("-" * 50)

    for check in results["checks"]:
        status = "✅" if check["ok"] else "❌"
        print(f"{status} {check['name']}: {check.get('status', 'ERROR')}")
        if check.get("error"):
            print(f"   에러: {check['error']}")

    print("-" * 50)
    if results["success"]:
        print("✅ 배포 확인 완료!")
    else:
        print("❌ 배포 확인 실패!")
    print("=" * 50 + "\n")


def main():
    # CLI 인자로 확인할 포스트 경로 받기 (예: /CS/backend-senior-interview-1)
    post_paths = sys.argv[1:] if len(sys.argv) > 1 else None

    # --no-wait 옵션 확인
    no_wait = "--no-wait" in sys.argv if sys.argv else False
    if no_wait and post_paths:
        post_paths = [p for p in post_paths if p != "--no-wait"]

    # GitHub Pages 배포 반영 대기
    if not no_wait:
        print(f"⏳ GitHub Pages 배포 반영 대기 ({DEPLOY_WAIT}초)...")
        time.sleep(DEPLOY_WAIT)

    # 배포 확인 실행
    results = verify_deployment(post_paths)

    # 결과 출력
    print_results(results)

    # 결과 파일 저장
    output_file = Path(__file__).parent / "deploy_result.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    # 종료 코드 반환
    sys.exit(0 if results["success"] else 1)


if __name__ == "__main__":
    main()
