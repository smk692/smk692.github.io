import datetime
import os

def create_blog_post(emoji, title, tags, author,categories):
    now = datetime.datetime.now()

    # 블로그 포스트에 사용될 파일 이름
    filename = "content/" + now.strftime("%Y-%m-%d") + "-" + title.lower().replace(" ", "-") + ".md"

    # 블로그 포스트에 사용될 메타데이터
    metadata = [
        "---",
        "layout: post",
        f"emoji: {emoji}",
        f"title: \"{title}\"",
        f"date: {now}",
        f"author: {author}",
        f"tags: {tags}",
        f"categories: {categories}",
        "---"
    ]

    # 블로그 포스트에 사용될 본문
    body = f"# {title}\n\n"

    # 블로그 포스트 파일 생성
    with open(filename, "w") as f:
        f.write("\n".join(metadata))
        f.write("\n")
        f.write(body)

    print(f"블로그 포스트 파일이 생성되었습니다: {filename}")


if __name__ == "__main__":
    emoji = "🔮"
    title = "블로그 글 제목을 입력하세요: "
    tags = "sample, frist".split(",")
    author = "손(Son/손민기)"
    categories = "블로그, SAMPLE".split(",")

    create_blog_post(emoji, title, tags, author, categories)