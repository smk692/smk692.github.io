#!/usr/bin/env python
"""
AI 기술 블로그 포스트 자동 생성기 v2.1
- GPT-4o 기반 고품질 콘텐츠 생성
- ChatGPT Plus 구독으로 OAuth 인증 (API 키 불필요)
- 품질 체크리스트 적용
- E-E-A-T 프레임워크 준수
"""

import datetime
import os
import re
import random
import json
import argparse
import sys
from typing import Tuple, Optional

# ============================================
# OAuth 인증 (ChatGPT Plus 구독 사용)
# ============================================
try:
    from codex_open_client import CodexClient
    USING_OAUTH = True
except ImportError:
    USING_OAUTH = False
    print("⚠️  codex-open-client 미설치. API 키 모드로 실행됩니다.")
    print("   ChatGPT 구독 사용하려면: pip install codex-open-client")

from openai import OpenAI
from PIL import Image
from io import BytesIO
import requests


# ============================================
# 설정
# ============================================
DEFAULT_MODEL = "gpt-4o"
IMAGE_MODEL = "dall-e-3"
MAX_TOKENS = 4096

# 피해야 할 AI 클리셰 단어
AI_CLICHE_WORDS = [
    "delve", "혁신적인", "심층적으로", "획기적인", "놀라운",
    "이 글에서는", "결론적으로", "마무리하며", "살펴보겠습니다"
]


# ============================================
# 프롬프트 템플릿
# ============================================
BLOG_PROMPT_TEMPLATE = """
<role>
시니어 백엔드 개발자이자 기술 블로그 작가. 10년 이상의 실무 경험 보유.
</role>

<context>
- 대상 독자: 주니어~미드레벨 개발자
- 플랫폼: 개인 기술 블로그 (smk692.github.io)
- 톤: 친근하지만 전문적, 실용적
- 언어: 한국어
</context>

<task>
"{topic}"에 대한 기술 블로그 포스트 작성
</task>

<constraints>
- 분량: 1500-2500자
- 핵심 논점으로 바로 시작 (장황한 서론 금지)
- 실제 동작하는 코드 예시 필수
- 모든 코드는 복사해서 바로 실행 가능해야 함
- 피해야 할 단어: delve, 혁신적인, 심층적으로, 획기적인
- "이 글에서는", "결론적으로" 같은 AI 클리셰 표현 금지
- 마크다운 형식 (H2, H3 사용, H1 제외)
</constraints>

<output_format>
## 핵심 개념 (왜 필요한가)
[2-3문장으로 핵심 요약]

## 기본 사용법
[코드 예시 + 설명]

## 실전 예제
[실제 프로젝트에서 사용하는 패턴]

## 주의사항
[흔한 실수, 함정, 성능 고려사항]

## 정리
[불릿 포인트로 핵심 3-5개]
[다음 학습 방향 제시]
</output_format>

<quality_checklist>
- E-E-A-T: 실제 경험 기반, 전문성, 신뢰성
- 가독성: 전문용어 설명, 적절한 코드 블록
- 독창성: 고유한 인사이트 또는 경험 포함
- 실용성: 바로 적용 가능한 코드/팁
</quality_checklist>
"""

HASHTAG_PROMPT = """
다음 블로그 포스트 내용을 분석하여 SEO에 최적화된 해시태그 15개를 추출해주세요.
- 한국어와 영어 혼용 가능
- 기술 키워드 중심
- 공백 없이 # 없이 단어만 출력
- 쉼표로 구분

내용:
{content}
"""


# ============================================
# 인증 헬퍼
# ============================================
def create_client(use_oauth: bool = True):
    """
    OpenAI 클라이언트 생성
    - OAuth 모드: ChatGPT Plus 구독 사용 (codex-open-client)
    - API 키 모드: OPENAI_API_KEY 환경변수 사용
    """
    if use_oauth and USING_OAUTH:
        # codex-open-client: ChatGPT 구독으로 API 사용
        # 처음 실행 시 브라우저에서 로그인
        # 토큰은 ~/.codex/auth.json에 캐시됨
        print("🔐 ChatGPT OAuth 인증 사용 중...")
        print("   (처음 실행 시 브라우저에서 로그인 필요)")
        return CodexClient(timeout=300.0)  # 5분 타임아웃
    else:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("❌ OPENAI_API_KEY 환경변수가 설정되지 않았습니다.")
            print("   ChatGPT 구독 사용하려면: pip install codex-open-client")
            sys.exit(1)
        print("🔑 API 키 인증 사용 중...")
        return OpenAI(api_key=api_key)


# ============================================
# 핵심 함수
# ============================================
class BlogPostGenerator:
    def __init__(self, use_oauth: bool = True):
        self.use_oauth = use_oauth and USING_OAUTH
        self.client = create_client(use_oauth)
        self.now = datetime.datetime.now()

    def generate_content(self, topic: str, model: str = DEFAULT_MODEL) -> str:
        """GPT-4o로 블로그 콘텐츠 생성"""
        prompt = BLOG_PROMPT_TEMPLATE.format(topic=topic)
        system_msg = "당신은 실무 경험이 풍부한 시니어 백엔드 개발자입니다. 명확하고 실용적인 기술 블로그를 작성합니다."

        if self.use_oauth and USING_OAUTH:
            # CodexClient: responses API (스트리밍으로 텍스트 수집)
            stream = self.client.responses.create(
                model="gpt-5.4",  # ChatGPT Plus에서 지원하는 모델
                instructions=system_msg,
                input=prompt,
                stream=True,
            )
            content = self._collect_stream_text(stream)
        else:
            # OpenAI: chat completions API 사용
            response = self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=MAX_TOKENS,
                temperature=0.7,
            )
            content = response.choices[0].message.content

        return self._clean_content(content)

    def _collect_stream_text(self, stream) -> str:
        """스트리밍 응답에서 텍스트 수집"""
        text_parts = []
        for event in stream:
            # ResponseOutputTextDeltaEvent에서 텍스트 추출
            if hasattr(event, 'delta'):
                text_parts.append(event.delta)
        return ''.join(text_parts)

    def _clean_content(self, content: str) -> str:
        """AI 클리셰 단어 제거 및 정리"""
        for word in AI_CLICHE_WORDS:
            content = content.replace(word, "")

        # 연속 공백 정리
        content = re.sub(r'\n{3,}', '\n\n', content)
        return content.strip()

    def generate_hashtags(self, content: str) -> str:
        """콘텐츠 기반 해시태그 생성"""
        prompt = HASHTAG_PROMPT.format(content=content[:2000])

        if self.use_oauth:
            # CodexClient: responses API (스트리밍)
            stream = self.client.responses.create(
                model="gpt-5.4-mini",  # 빠른 작업용 모델
                instructions="SEO 전문가로서 해시태그를 추출합니다.",
                input=prompt,
                stream=True,
            )
            tags = self._collect_stream_text(stream)
        else:
            # OpenAI: chat completions API 사용
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "user", "content": prompt}
                ],
                max_tokens=200,
                temperature=0.5,
            )
            tags = response.choices[0].message.content

        # 정리: # 제거, 쉼표 구분 → 공백 구분
        tags = tags.replace("#", "").replace(",", " ")
        tags = " ".join(tags.split())
        return tags

    def generate_image(self, topic: str, save_path: str) -> Optional[str]:
        """DALL-E 3로 대표 이미지 생성 (API 키 모드에서만 지원)"""
        if self.use_oauth:
            print("⚠️  OAuth 모드에서는 이미지 생성이 지원되지 않습니다.")
            return None

        prompt = f"""
        기술 블로그 대표 이미지: {topic}
        스타일: 미니멀, 모던, 테크, 블루/퍼플 그라데이션
        요소: 관련 아이콘, 다이어그램, 코드 조각
        분위기: 전문적, 깔끔
        """

        try:
            response = self.client.images.generate(
                model=IMAGE_MODEL,
                prompt=prompt,
                size="1024x1024",
                quality="standard",
                n=1,
            )

            image_url = response.data[0].url
            image_data = requests.get(image_url).content
            image = Image.open(BytesIO(image_data))
            image.save(save_path)
            return save_path
        except Exception as e:
            print(f"이미지 생성 실패: {e}")
            return None

    def calculate_reading_time(self, content: str) -> int:
        """읽기 시간 계산 (분)"""
        # 한국어 평균 읽기 속도: 분당 500자
        char_count = len(content.replace(" ", "").replace("\n", ""))
        return max(1, round(char_count / 500))

    def create_emoji(self) -> str:
        """랜덤 이모지 생성"""
        emojis = ["🚀", "💡", "🔧", "📚", "🎯", "⚡", "🔍", "🛠️", "📊", "🧩", "🎓", "💻"]
        return random.choice(emojis)

    def create_post(
        self,
        topic: str,
        categories: str,
        series: Optional[str] = None,
        generate_image: bool = False
    ) -> str:
        """블로그 포스트 생성 메인 함수"""

        # 디렉토리 설정
        date_str = self.now.strftime("%Y-%m-%d")
        slug = topic.lower().replace(" ", "-")
        directory_path = f"content/{date_str}-{slug}"
        file_name = f"{directory_path}/index.md"

        # 폴더 생성
        if not os.path.exists(directory_path):
            os.makedirs(directory_path)

        # 콘텐츠 생성
        print(f"📝 콘텐츠 생성 중: {topic}")
        content = self.generate_content(topic)

        # 해시태그 생성
        print("🏷️ 해시태그 생성 중...")
        tags = self.generate_hashtags(content)

        # 읽기 시간 계산
        reading_time = self.calculate_reading_time(content)

        # 이미지 생성 (선택적)
        image_path = None
        if generate_image:
            print("🖼️ 이미지 생성 중...")
            image_path = self.generate_image(topic, f"{directory_path}/thumbnail.png")

        # 메타데이터 구성
        metadata = {
            "layout": "post",
            "emoji": self.create_emoji(),
            "title": topic,
            "date": self.now.strftime('%Y-%m-%d %H:%M:%S'),
            "author": "손(Son/손민기)",
            "tags": tags,
            "categories": categories,
            "readingTime": reading_time,
        }

        if series:
            metadata["series"] = series

        if image_path:
            metadata["thumbnail"] = "./thumbnail.png"

        # 파일 작성
        with open(file_name, "w", encoding="utf-8") as f:
            f.write("---\n")
            for key, value in metadata.items():
                if isinstance(value, str) and " " in value:
                    f.write(f'{key}: "{value}"\n')
                else:
                    f.write(f"{key}: {value}\n")
            f.write("---\n\n")
            f.write(content)
            f.write("\n\n```toc\n```")

        print(f"✅ 블로그 포스트 생성 완료: {file_name}")
        return file_name

    def quality_check(self, content: str) -> dict:
        """품질 체크 결과 반환"""
        checks = {
            "length": len(content) >= 1500,
            "has_code": "```" in content,
            "no_cliche": not any(word in content for word in AI_CLICHE_WORDS),
            "has_headings": "##" in content,
            "has_list": "- " in content or "1." in content,
        }

        score = sum(checks.values()) / len(checks) * 100
        checks["score"] = score

        return checks


# ============================================
# CLI 인터페이스
# ============================================
def main():
    parser = argparse.ArgumentParser(description="AI 블로그 포스트 생성기 v2.1")
    parser.add_argument("--topic", type=str, help="블로그 주제")
    parser.add_argument("--categories", type=str, default="Tech", help="카테고리")
    parser.add_argument("--series", type=str, help="시리즈 이름 (선택)")
    parser.add_argument("--image", action="store_true", help="이미지 생성 여부")
    parser.add_argument("--interactive", action="store_true", help="대화형 모드")
    parser.add_argument("--api-key", action="store_true", help="API 키 모드 (OAuth 대신)")

    args = parser.parse_args()

    # OAuth vs API 키 선택
    use_oauth = not args.api_key

    print("🤖 AI 블로그 포스트 생성기 v2.1")
    print("-" * 40)
    if use_oauth and USING_OAUTH:
        print("✨ ChatGPT Plus 구독 모드 (OAuth)")
    else:
        print("🔑 API 키 모드")
    print("-" * 40)

    generator = BlogPostGenerator(use_oauth=use_oauth)

    if args.interactive or not args.topic:
        # 대화형 모드
        topic = input("📌 주제를 입력하세요: ").strip()
        categories = input("📂 카테고리 (기본: Tech): ").strip() or "Tech"
        series = input("📚 시리즈 (선택, Enter로 건너뛰기): ").strip() or None
        gen_image = input("🖼️ 이미지 생성? (y/N): ").strip().lower() == "y"
    else:
        topic = args.topic
        categories = args.categories
        series = args.series
        gen_image = args.image

    if not topic:
        print("❌ 주제를 입력해주세요.")
        return

    # 포스트 생성
    file_path = generator.create_post(
        topic=topic,
        categories=categories,
        series=series,
        generate_image=gen_image
    )

    # 품질 체크
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    quality = generator.quality_check(content)
    print(f"\n📊 품질 점수: {quality['score']:.0f}%")
    for check, passed in quality.items():
        if check != "score":
            status = "✅" if passed else "❌"
            print(f"  {status} {check}")


if __name__ == "__main__":
    main()
