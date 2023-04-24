module.exports = {
  title: '👋 손코딩의 끄적끄적 블로그',
  description: '손코딩의 끄적끄적 블로그',
  language: `ko`, // `ko`, `en` => currently support versions for Korean and English
  siteUrl: 'https://smk692.github.io/',
  ogImage: `/og-image.png`, // Path to your in the 'static' folder
  comments: {
    utterances: {
      repo: `smk692/blog-comments`, // `zoomkoding/zoomkoding-gatsby-blog`,
    },
  },
  ga: 'UA-265647540-1', // Google Analytics Tracking ID
  author: {
    name: `손민기`,
    bio: {
      role: '백엔드 개발자',
      description: ['개발에 미친놈', '큰 그림을 그리는 아키텍처', '조금 더 알고 싶은'],
      thumbnail: 'sample.png', // Path to the image in the 'asset' folder
    },
    social: {
      github: 'https://github.com/smk692',
      linkedIn: 'https://www.linkedin.com/in/%EB%AF%BC%EA%B8%B0-%EC%86%90-12aa94227/',
      email: 'smk2692@gmail.com',
    },
  },

  // metadata for About Page
  about: {
    timestamps: [
      // =====       [Timestamp Sample and Structure]      =====
      // ===== 🚫 Don't erase this sample (여기 지우지 마세요!) =====
      {
        date: '',
        activity: '',
        links: {
          github: '',
          post: '',
          googlePlay: '',
          appStore: '',
          demo: '',
        },
      },
      // ========================================================
      // ========================================================
      {
        date: '2021.02 ~',
        activity: '개인 블로그 개발 및 운영',
        links: {
          post: '/gatsby-starter-soncoding-introduction',
          github: 'https://github.com/smk692/smk692.github.io',
        },
      },
    ],

    projects: [
      // =====        [Project Sample and Structure]        =====
      // ===== 🚫 Don't erase this sample (여기 지우지 마세요!)  =====
      {
        title: '',
        description: '',
        techStack: ['', ''],
        thumbnailUrl: '',
        links: {
          post: '',
          github: '',
          googlePlay: '',
          appStore: '',
          demo: '',
        },
      },
      // ========================================================
      // ========================================================
      {
        title: '개발 블로그 테마 개발',
        description:
          '개발 블로그를 운영하는 기간이 조금씩 늘어나고 점점 많은 생각과 경험이 블로그에 쌓아가면서 제 이야기를 담고 있는 블로그를 직접 만들어보고 싶게 되었습니다. 그동안 여러 개발 블로그를 보면서 좋았던 부분과 불편했던 부분들을 바탕으로 레퍼런스를 참고하여 직접 블로그 테마를 만들게 되었습니다.',
        techStack: ['gatsby', 'react'],
        thumbnailUrl: 'blog.png',
        links: {
          post: '/gatsby-starter-soncoding-introduction',
          github: 'https://github.com/smk692/smk692.github.io',
        },
      },
    ],
  },
};
