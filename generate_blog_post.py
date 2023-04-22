import datetime
import os
import re
import random
import openai

def create_blog_post(emoji, title, tags, author, categories, contents):
    now = datetime.datetime.now()

    directory_path = "content/" + now.strftime("%Y-%m-%d")
    file_name = directory_path + "/" + title.lower().replace(" ", "-") + now.strftime('%H:%M:%S')+ ".md"

    # 폴더가 없으면 생성
    if not os.path.exists(directory_path):
        os.makedirs(directory_path)

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
    with open(file_name, "w") as f:
        f.write("\n".join(metadata))
        f.write("\n")
        f.write(body)
        f.write(contents)

    print(f"블로그 포스트 파일이 생성되었습니다: {file_name}")

def generate_contents(topic):
    openai.api_key = os.getenv("OPENAI_API_KEY")

    prompt = f'''
    You are now an expert developer.

    Please write a blog post in markdown format on the topic of {topic}. Apply highlights, bolds, and italics to important words or sentences.

    Provide clean and concise subheadings that match the content, and write an SEO-optimized post that is 3000 characters or less to ensure high visibility. Also, summarize the advantages and disadvantages of using the topic, and extract 30 hashtags relevant to the content and list them at the beginning of the post.

    The total length of the blog should be around 10 minutes.

    The target audience for this post is expert developers, so make sure to make it readable and easy to understand.

    Add multiple hashtags at the end of the post only.

    Please make sure to follow the rules listed above.
    '''

    return connection_chatgpt(prompt)


def connection_chatgpt(prompt):
    response = openai.Completion.create(
        model="davinci",
        prompt=prompt,
        temperature=0.1,
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
        print(w)
        tag_str += f'{w} '

    return tag_str

def create_emoji():
    start = 0x1F600     # 이모지 시작 유니코드 값
    end = 0x1F64F       # 이모지 끝 유니코드 값
    return chr(random.randint(start, end))  # 랜덤한 이모지 선택

if __name__ == "__main__":

    topic = "Kafka(MSK) 정리 및 사용 사례"
    contents, tags = generate_contents(topic)

    emoji = create_emoji()
    categories = contents.split('\n')[0]
    title = topic
    author = "손(Son/손민기)"
    contents = '\n'.join(contents.strip().split('\n')[1:])
    print("-----------------------")
    print(categories)
    print("-----------------------")
    print(title)
    print("-----------------------")
    print(contents)
    print("-----------------------")

    create_blog_post(emoji, title, tags, author, categories, contents)
