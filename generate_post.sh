#!/bin/bash
# ===========================================
# 블로그 포스트 생성 래퍼 스크립트
# 가상환경 자동 활성화 후 실행
# ===========================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 가상환경 확인
if [ ! -d ".venv" ]; then
    echo "❌ 가상환경이 없습니다. 먼저 setup.sh를 실행하세요."
    echo "   ./setup.sh"
    exit 1
fi

# 가상환경 활성화 및 실행
source .venv/bin/activate
python generate_blog_post.py "$@"
deactivate
