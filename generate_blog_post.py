#!/usr/bin/env python

import datetime
import os
import re
import random
import openai
import pprint

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

    prompt_contents = f'''
        Please write in Korean:
        From now on, you are an IT expert. Please write a blog post in markdown format on the topic of {topic}. Apply highlights, bolds, and italics to important words or sentences.
        Define subheadings, advantages and disadvantages, application examples, and sample results in markdown format.
        Provide clean and concise subheadings that match the content, and write an SEO-optimized post that is 3000 characters or less to ensure high visibility. Also, summarize the advantages and disadvantages of using the topic
        The target audience for this post is expert developers, so make sure to make it readable and easy to understand.
    '''
    prompt_tags = f'''
        {prompt_contents}
        Could you please summarize and supplement the previous message into a message that is within 3300 characters? The previous message contained information regarding the previous conversation and it would be great if it could be made to sound more human-like and create a place to insert images.
        Impontant! Please supplement and continue writing based on the initial question and extract 30 hashtags relevant to the content and list them at the beginning of the post using a comma as a separator.
    '''

    contents = connection_chatgpt(prompt_contents)
    contents += connection_chatgpt(prompt_tags)

    return contents, hashtag_export(contents)

def connection_chatgpt(prompt):
    response = openai.Completion.create(
        model="text-davinci-003",
        prompt=prompt,
        temperature=0.1,
        max_tokens=3500,
        top_p=1,
        frequency_penalty=0.0,
        presence_penalty=0.6,
    )
    contents = ""
    for choice in response.choices:
        contents += choice.text

    return contents

def hashtag_export(contents):

    hashtags_part = contents.split("# Hashtags")[-1]

    hashtag_pattern = r'\B#\w+'
    hashtags = re.findall(hashtag_pattern, hashtags_part)

    clean_hashtags = []
    for hashtag in hashtags:
        clean_hashtag = re.sub(r'[^\w\s]', '', hashtag)
        clean_hashtags.append(clean_hashtag)

    return " ".join(clean_hashtags)

def create_emoji():
    start = 0x1F600
    end = 0x1F64F
    return chr(random.randint(start, end))

if __name__ == "__main__":
    topic = "Kafka 구조, 내용 및 사용 사례"
    contents, tags = generate_contents(topic)

    pprint.pprint("-----------------------")
    pprint.pprint(contents)

    emoji = create_emoji()
    categories = "KAFKA"
    title = topic
    author = "손(Son/손민기)"
    contents = '\n'.join(contents.strip().split('\n')[0:])

    create_blog_post(emoji, title, tags, author, categories, contents)
