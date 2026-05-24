#!/bin/bash
# ===========================================
# 블로그 포스트 생성기 설정 스크립트
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 블로그 포스트 생성기 설정 시작..."
echo "==========================================="

# 가상환경 확인/생성
if [ ! -d ".venv" ]; then
    echo "📦 가상환경 생성 중..."
    python3 -m venv .venv
fi

# 가상환경 활성화
echo "🔧 가상환경 활성화..."
source .venv/bin/activate

# 의존성 설치
echo "📥 의존성 설치 중..."
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "==========================================="
echo "✅ 설정 완료!"
echo ""
echo "사용법:"
echo "  1. 가상환경 활성화:"
echo "     source .venv/bin/activate"
echo ""
echo "  2. 블로그 포스트 생성:"
echo "     python generate_blog_post.py"
echo ""
echo "  3. CLI 모드:"
echo "     python generate_blog_post.py --topic \"주제\" --categories \"Tech\""
echo ""
echo "  4. 가상환경 비활성화:"
echo "     deactivate"
echo "==========================================="
