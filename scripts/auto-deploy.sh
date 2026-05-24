#!/bin/bash
#
# 블로그 자동 배포 스크립트
# 사용법: ./scripts/auto-deploy.sh [옵션]
#
# 옵션:
#   --topic "주제"        : 새 포스트 생성 (없으면 건너뜀)
#   --categories "카테고리" : 포스트 카테고리 (기본: Tech)
#   --skip-quality-check  : 품질 점검 건너뛰기
#   --dry-run             : 배포 없이 빌드만
#   --help                : 도움말 표시
#

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 기본값
BLOG_DIR="/Users/sonmingi/Documents/Obsidian Vault/blog/smk692.github.io"
TOPIC=""
CATEGORIES="Tech"
SKIP_QUALITY_CHECK=false
DRY_RUN=false
MIN_QUALITY_SCORE=70

# 함수: 로그 출력
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# 함수: 도움말
show_help() {
    echo "블로그 자동 배포 스크립트"
    echo ""
    echo "사용법: $0 [옵션]"
    echo ""
    echo "옵션:"
    echo "  --topic \"주제\"         새 포스트 생성"
    echo "  --categories \"카테고리\"  포스트 카테고리 (기본: Tech)"
    echo "  --skip-quality-check   품질 점검 건너뛰기"
    echo "  --dry-run              배포 없이 빌드만"
    echo "  --help                 도움말 표시"
    echo ""
    echo "예시:"
    echo "  $0 --topic \"Python asyncio\" --categories \"Python\""
    echo "  $0 --dry-run"
    exit 0
}

# 인자 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        --topic)
            TOPIC="$2"
            shift 2
            ;;
        --categories)
            CATEGORIES="$2"
            shift 2
            ;;
        --skip-quality-check)
            SKIP_QUALITY_CHECK=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            show_help
            ;;
        *)
            log_error "알 수 없는 옵션: $1"
            show_help
            ;;
    esac
done

# 블로그 디렉토리로 이동
cd "$BLOG_DIR"

echo ""
echo "=========================================="
echo "🚀 블로그 자동 배포 파이프라인"
echo "=========================================="
echo ""

# 1단계: 포스트 생성 (선택)
if [ -n "$TOPIC" ]; then
    log_info "1단계: 포스트 생성 중... ($TOPIC)"

    source .venv/bin/activate

    # 포스트 생성 및 품질 점수 캡처
    OUTPUT=$(python generate_blog_post.py --topic "$TOPIC" --categories "$CATEGORIES" 2>&1)
    echo "$OUTPUT"

    # 품질 점수 추출
    QUALITY_SCORE=$(echo "$OUTPUT" | grep -oE "품질 점수: [0-9]+" | grep -oE "[0-9]+")

    if [ -n "$QUALITY_SCORE" ]; then
        if [ "$QUALITY_SCORE" -lt "$MIN_QUALITY_SCORE" ] && [ "$SKIP_QUALITY_CHECK" = false ]; then
            log_warning "품질 점수가 ${MIN_QUALITY_SCORE}% 미만입니다 (${QUALITY_SCORE}%)"
            read -p "계속 진행하시겠습니까? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_error "배포가 취소되었습니다."
                exit 1
            fi
        else
            log_success "품질 점수: ${QUALITY_SCORE}%"
        fi
    fi

    deactivate
else
    log_info "1단계: 포스트 생성 건너뜀 (--topic 없음)"
fi

# 2단계: 변경사항 확인 및 커밋
log_info "2단계: 변경사항 확인 중..."

if git status --porcelain | grep -q .; then
    log_info "변경사항 커밋 중..."

    git add content/

    if [ -n "$TOPIC" ]; then
        COMMIT_MSG="📝 Add new blog post: $TOPIC

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
    else
        COMMIT_MSG="📝 Update blog content

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
    fi

    git commit -m "$COMMIT_MSG" || log_info "커밋할 변경사항 없음"
    git push origin master || log_warning "푸시 실패 - 수동 확인 필요"

    log_success "변경사항 커밋 완료"
else
    log_info "변경사항 없음"
fi

# 3단계: Node.js 환경 설정
log_info "3단계: Node.js 환경 설정 중..."

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm use 18 || {
    log_error "Node.js 18이 설치되어 있지 않습니다. 'nvm install 18' 실행 필요"
    exit 1
}

log_success "Node.js $(node --version) 사용 중"

# 4단계: 의존성 설치 (필요 시)
if [ ! -d "node_modules" ]; then
    log_info "4단계: 의존성 설치 중..."
    npm install --legacy-peer-deps
    log_success "의존성 설치 완료"
else
    log_info "4단계: 의존성 설치 건너뜀 (node_modules 존재)"
fi

# 5단계: 빌드
log_info "5단계: Gatsby 빌드 중..."

npx gatsby clean
npx gatsby build

log_success "빌드 완료"

# 6단계: 배포
if [ "$DRY_RUN" = true ]; then
    log_warning "6단계: 드라이런 모드 - 배포 건너뜀"
else
    log_info "6단계: GitHub Pages 배포 중..."

    npx gh-pages -d public

    log_success "배포 완료!"
fi

echo ""
echo "=========================================="
echo "🎉 파이프라인 완료!"
echo "=========================================="
echo ""
echo "📍 블로그 URL: https://smk692.github.io"
echo ""

if [ -n "$TOPIC" ]; then
    echo "📝 새 포스트: $TOPIC"
fi

echo ""
