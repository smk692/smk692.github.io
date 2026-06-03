---
layout: post
emoji: 💡
title: "🚀 Git Blog 자동화 하는법"
date: '2023-04-24 03:21:25'
author: 손(Son/손민기)
tags: 블로그자동화 Gatsby Git CICD 마크다운 정적사이트 개발자블로그
categories: Featured
---
## 🚀 블로그를 왜 써야 하는지?!
개발자는 기술 블로그를 통해 자신의 경험을 공유하고, 다른 개발자들과 지식을 공유하며 성장할 수 있습니다. 

또한, 블로그를 운영함으로써 자신의 프로젝트나 포트폴리오를 보다 쉽게 공유하고, 개인 브랜딩에도 도움이 됩니다.

<br/>

> 솔직하게 광고로 얼마를 벌 수 있는지 한번 심심해서 시작했습니다. ㅎㅎㅎ...
> 
> 개발에 대해 살짝이라도 알고 계시면 추천 합니다!

<br/>

## 🔨 준비물이 무엇이 필요한지?!
자동화된 Git Blog를 운영하기 위해 필요한 준비물은 다음과 같습니다.

- Git 계정 및 블로그 호스팅 플랫폼 (e.g. GitHub, GitLab, Bitbucket, Gitea 등)

<br>

- 정적 사이트 생성기 (e.g. Jekyll, Hugo, Pelican 등)

<br>

- 마크다운 에디터 (e.g. Typora, Visual Studio Code 등)
  
<br>
  
- 자동화 스크립트 (e.g. GitHub Actions, Travis CI 등)

<br/>
    
    
    제가 세웠던 아키텍처는 GitHub Actions를 사용하여 Jekyll 기반의 정적 블로그를 자동화하는 방법입니다.

    1. Github blog 를 사용한다. (API 사용 할 수 있다면 어떤 블로그여도 상관없습니다.)
   
    2. 스케쥴러를 돌릴 수 있는 환경이 있어야된다. (자동으로 주제에 대해 ChatGpt 한테 써달라고 할거거든요.)

    3. 간단하게 실행 시킬 파일이 있어야됩니다. (Python, Node ...)

    간단하게 정리하면 아키텍처는 아래와 같습니다.
    
        1. Python 을 이용해서 ChatGpt 연동 후 주제를 DB 또는 구글 시트로 모아 놓는다.
        2. Github action 스케쥴러를 사용하여 두개의 잡을 만든다. 
            a. 주제 생성 및 겹치지 않게 관리 하는 Job
            b. 주제에 대해 컨텐츠를 만드는 Job
        3. 스케쥴러가 정상적으로 돈 후 Github > commit & deploy 진행 시킨다. (CI/CD 구축)
   
    ps.나중에 그림 추가 예정입니다. 

## 🧐 블로그 글을 자동화 하는방법 !?

블로그를 자동화하는 방법은 크게 두 가지로 나눌 수 있습니다.

> 첫째는 정적 사이트 생성기와 Git 호스팅 플랫폼을 사용하여 블로그를 만든 뒤, Git Action과 같은 CI/CD 도구를 이용하여 컨텐츠를 자동으로 생성하고, 빌드 및 배포하는 방법입니다. 이 방법은 블로그의 구조가 정적이기 때문에 작성된 컨텐츠가 많지 않다면 좀 더 쉽게 자동화할 수 있습니다.

> 둘째는 동적인 블로그를 만들어 서버를 통해 자동화하는 방법입니다. 이 방법은 블로그가 동적인 특성을 띄기 때문에 컨텐츠를 생성하고 배포하는 과정이 더 복잡해질 수 있습니다. 그러나 이 방법을 사용하면 블로그에 좀 더 많은 기능을 추가할 수 있으며, 블로그 운영에 있어서 더욱 유연성이 있습니다.

> 어떤 방법을 선택하더라도 블로그를 자동화하는 것은 개발자로서의 역량을 높이는데 큰 도움이 됩니다. 컨텐츠를 생성하고, 배포하는 과정을 자동화함으로써 개발자는 좀 더 많은 시간을 개발에 집중할 수 있으며, 블로그 운영에 대한 부담을 줄일 수 있습니다.

**저는 두번째 방법으로 진행할 예정입니다.**

### Git blog 만드는법
- 블로그 저장소 생성 및 Jekyll 테마 적용
- GitHub, GitLab, Bitbucket 등의 Git 호스팅 플랫폼에서 새로운 저장소를 생성하고, Jekyll 기반의 정적 블로그 테마를 적용합니다.
- 제 경우는 [줌코딩님 Blog](https://github.com/zoomKoding/zoomkoding-gatsby-blog/) 템플릿을 갖고와서 사용했습니다.

### 자동화 스크립트 작성
- GitHub Actions을 사용하여 블로그를 자동으로 빌드하고 배포하는 자동화 스크립트를 작성합니다. 

**Github action 전에 준비 작업**
해당하는 Github Reposittory > setting > security > action

- MY_EMAIL, MY_NAME, MY_TOKEN, OPENAI_API_KEY 추가해주세요.
> ![blog3.png](blog3.png)

이 스크립트는 블로그 저장소의 .github/workflows 디렉토리에 작성됩니다. 

- 아래는 yaml 예시입니다.

    ```yaml
    name: Auto Publish Blog Posts by 손(Son/손민기)

    on:
    schedule:
        - cron: '0 0 * * *'

    jobs:
    generate-blog-post:
        runs-on: ubuntu-latest
        steps:
        - name: Checkout Repository
            uses: actions/checkout@v2

        - name: Set up Python
            uses: actions/setup-python@v2
            with:
            python-version: 3.x

        - name: Cache Python packages
            uses: actions/cache@v2
            with:
            path: ~/.cache/pip
            key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements.txt') }}
            restore-keys: |
                ${{ runner.os }}-pip-

        - name: Install Required Python Packages
            run: |
            python -m pip install --upgrade pip
            pip install gitpython
            pip install -r requirements.txt

        - name: Generate Blog Post
            env:
            OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
            run: python generate_blog_post.py

        - name: Commit Changes
            env:
            MY_EMAIL: ${{ secrets.MY_EMAIL }}
            MY_NAME: ${{ secrets.MY_NAME }}
            MY_TOKEN : ${{ secrets.MY_TOKEN }}
            run: |
            git config --local user.email $MY_EMAIL
            git config --local user.name $MY_NAME

            git remote set-url origin https://$MY_NAME:$MY_TOKEN@github.com/smk692/smk692.github.io.git

            git add .
            git commit -m "Add a new blog post"
            git push

    deploy:
        needs: generate-blog-post
        runs-on: ubuntu-latest
        steps:
        - name: Checkout Repository
            uses: actions/checkout@v2

        - uses: actions/setup-node@v3
            with:
            node-version: v14.17.4

        - name: Cache node modules
            uses: actions/cache@v2
            with:
            path: ~/.npm
            key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
            restore-keys: |
                ${{ runner.os }}-npm-

        - name: Npm install
            run: npm install

        - name: Update blog
            env:
            MY_EMAIL: ${{ secrets.MY_EMAIL }}
            MY_NAME: ${{ secrets.MY_NAME }}
            MY_TOKEN : ${{ secrets.MY_TOKEN }}
            run: |
            git config --local user.email $MY_EMAIL
            git config --local user.name $MY_NAME

            git remote set-url origin https://$MY_NAME:$MY_TOKEN@github.com/smk692/smk692.github.io.git

            npm run deploy

    ```

- GitHub Actions을 사용하여 블로그 컨텐츠 업데이트하는 파이썬 코드입니다. (generate_blog_post.py)

    ```python
    # ...import 부분 생략 
    
    def generate_contents(topic):
        openai.api_key = os.getenv("OPENAI_API_KEY")

        prompt_contents = f'''
            {topic} 대해서 자세하게 적어줘
        '''

        contents = connection_chatgpt(prompt_contents)

        contents = '\n'.join(contents.strip().split('\n')[3:])

        return contents

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

    def create_blog_post(topic, tags, categories, contents):

        # 폴더가 없으면 생성
        if not os.path.exists(directory_path):
            os.makedirs(directory_path)

        # 블로그 포스트에 사용될 메타데이터
        metadata = [
            "---",
            "layout: post",
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
            f.write(contents)

        print(f"블로그 포스트 파일이 생성되었습니다: {file_name}")

    if __name__ == "__main__":

        topic       = "블로그 자동화!"
        tags        = "gitblog"
        categories  = "자동화"

        contents = generate_contents(topic)
        pprint.pprint(contents)

        create_blog_post(topic, tags, categories, contents)
    ```

<br/>

## ✅ 완성된 결과에 대한 스크린샷!

- **Github action 글 생성 된 결과**

    ![blog1.png](blog1.png)

- **Github action 글 배포 된 결과**
    
    ![blog1.png](blog2.png)

- **Github blog 업데이트 된 결과**
    
    ![blog4.png](blog4.png)

<br/>

 # 소감
 이상으로 블로그 자동화에 대해 알아보았습니다.
 
 자동화를 통해 개발자는 블로그 운영을 보다 효율적으로 할 수 있고, 더 많은 시간을 개발에 집중할 수 있습니다.

 많은 개발자분들이 이 글을 보고 자신만의 자동화된 블로그를 운영하시길 바랍니다!

    ps. 간단하게 짠거라 필요하면 갖고 가시면 됩니다. (대신 댓글 하나만 적어주세요.)

        반박 시 무조건 생각한게 맞습니다.


```toc

```