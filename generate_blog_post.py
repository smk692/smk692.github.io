#!/usr/bin/env python

import datetime
import os
import re
import random
import openai
import pprint
import requests

from PIL import Image
from io import BytesIO


topic           = "kafka broker, topic, partition 내용 및 사용 사례"
categories      = "KAFKA"

now             = datetime.datetime.now()
directory_path  = "content/" + now.strftime("%Y-%m-%d")
main_picture    = directory_path + "/" + topic + ".png"
file_name       = directory_path + "/" + topic.lower().replace(" ", "-") + now.strftime('%H:%M:%S')+ ".md"

def main_image_create():
    # 이미지를 생성할 prompt와 이미지 크기 지정
    prompt = f'''Kafka 토픽 및 파티션에 대한 구조 정리한 사진 만들어줘'''

    # chatgpt 모델을 사용하여 이미지 생성 요청
    response = openai.Image.create(
        prompt=prompt,
        n=1,
        size="1024x1024",
        model="image-alpha-001",
    )

    # 생성된 이미지 URL 추출
    image_url = response["data"][0]["url"]

    # 추출한 이미지 URL로부터 이미지 다운로드
    image_data = requests.get(image_url).content

    # 다운로드한 이미지 PIL Image 객체로 변환
    image = Image.open(BytesIO(image_data))

    # 이미지 파일로 저장
    image.save(main_picture)

def create_blog_post(topic, tags, categories, contents):

    # 폴더가 없으면 생성
    if not os.path.exists(directory_path):
        os.makedirs(directory_path)

    # 이모지 생성
    emoji = create_emoji()

    # 블로그 포스트에 사용될 메타데이터
    metadata = [
        "---",
        "layout: post",
        f"emoji: {emoji}",
        f"title: \"{topic}\"",
        f"date: '{now.strftime('%Y-%m-%d %H:%M:%S')}'",
        f"author: 손(Son/손민기)",
        f"tags: {tags}",
        f"categories: {categories}",
        "---"
    ]

    # 블로그 포스트 파일 생성
    with open(file_name, "w") as f:
        
        f.write("\n".join(metadata))
        f.write("\n")
        # f.write("![main_picture]" + main_picture)
        f.write(contents)
        f.write('```' + "\n" + "toc```")

    print(f"블로그 포스트 파일이 생성되었습니다: {file_name}")

def generate_contents(topic):
    openai.api_key = os.getenv("OPENAI_API_KEY")

    prompt_contents = f'''
        Please write in Korean:
        
        As an IT expert, let's create a blog post in markdown format on the topic of {topic}.
        Oh, and please remove the title.
        
        Please apply highlights, bolds, and italics to important words or sentences.
        Define subheadings, advantages and disadvantages, application examples, Java sample code, and code results in markdown format.
        Provide clean and concise subheadings that match the content, and write an SEO-optimized post.
        Please summarize the pros and cons of using the topic as the target audience for this post is expert developers, so make it readable and easy to understand.
        It would be great to make the post sound more human-like and create a space to insert images by including information about the previous conversation.

        Important! Please supplement and continue writing based on the initial question, and extract 30 hashtags relevant to the content and list them at the beginning of the post using a comma as a separator.
    '''

    contents = connection_chatgpt(prompt_contents)

    contents = '\n'.join(contents.strip().split('\n')[3:])

    return contents, hashtag_export(contents)

def connection_chatgpt(prompt):
    response = openai.Completion.create(
        model="text-davinci-003",
        prompt=prompt,
        temperature=1,
        max_tokens=3800,
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
    # main_image_create()
    contents, tags = generate_contents(topic)
    pprint.pprint(contents)

    create_blog_post(topic, tags, categories, contents)
