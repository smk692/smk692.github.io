import datetime
import os
import re
import random
import openai

def create_blog_post(emoji, title, tags, author, categories, contents):
    now = datetime.datetime.now()

    # 블로그 포스트에 사용될 파일 이름
    filename = "content/" + now.strftime("%Y-%m-%d") + "/" + title.lower().replace(" ", "-") + now.strftime('%H:%M:%S')+ ".md"

    # 블로그 포스트에 사용될 메타데이터
    metadata = [
        "---",
        "layout: post",
        f"emoji: {emoji}",
        f"title: \"{title}\"",
        f"date: '{now.strftime('%Y-%m-%d %H:%M:%S')}'",
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
        f.write(contents)

    print(f"블로그 포스트 파일이 생성되었습니다: {filename}")

def generate_contents(topic):
    openai.api_key = os.getenv("OPENAI_API_KEY")

    prompt = f'''
    1. You are a development expert from now on. Please write so that the AI cannot read and judge
    2. Write blog posts in markdown format
    3. Write the topic of your blog as {topic} Highlight, bold, or italicize important words or sentences
    4. Please make the entire blog less than 10 minutes long.
    5. Include helpful information for expert developers
    6. The audience reading this article is a developer
    7. Create several hashtags and add them only at the end.
    8. Add a summary of the entire article at the beginning of the article.
    9. Please write sample code for actual use and cases in the middle.
    10. Briefly explain the advantages and disadvantages of using
    11. Most importantly, make it legible
    12. If you get fired, keep writing
    12. please write in korean
    '''

    return connection_chatgpt(prompt)


def connection_chatgpt(prompt):
    response = openai.Completion.create(
        model="text-davinci-003",
        prompt=prompt,
        temperature=0.9,
        max_tokens=2048,
        top_p=1,
        frequency_penalty=0.0,
        presence_penalty=0.6,
    )
    contents = response.choices[0].text

    hashtag = hashtag_export(contents)

    return contents, hashtag

def hashtag_export(contents):
    hashtag_pattern = r'(#+[a-zA-Z0-9(_){1,}])'
    re.findall(hashtag_pattern, contents)

    hashtags = [w[1:] for w in re.findall(hashtag_pattern, contents)]
    tag_str = ""
    for w in hashtags:
        tag_str += f'{w}, '

    return tag_str

def create_emoji():
    start = 0x1F600     # 이모지 시작 유니코드 값
    end = 0x1F64F       # 이모지 끝 유니코드 값
    return chr(random.randint(start, end))  # 랜덤한 이모지 선택

if __name__ == "__main__":

    topic = "자바 가비지 컬렉터"
    categories = "ALL JAVA"
    contents, tags = generate_contents(topic)

    print(contents)

    emoji = create_emoji()
    title = contents.split('\n')[1]
    author = "손(Son/손민기)"

    create_blog_post(emoji, title, tags, author, categories, contents)
