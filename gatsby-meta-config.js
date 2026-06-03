module.exports = {
  title: '👋 손코딩의 끄적끄적 블로그',
  description: '손코딩의 끄적끄적 블로그',
  language: `ko`, // `ko`, `en` => currently support versions for Korean and English
  siteUrl: 'https://smk692.github.io',
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
      role: 'Backend Developer & Tech Lead',
      description: [
        '익숙함에 머무르기보다 더 나은 방향을 만드는',
        '새로운 도전과 변화를 즐기는',
        '동료들과 치열하게 토론하는',
        'ADR과 구축 사례로 새로운 기술을 스며들게 하는',
      ],
      thumbnail: 'sample.png', // Path to the image in the 'asset' folder
    },
    social: {
      github: 'https://github.com/smk692',
      linkedIn: 'https://www.linkedin.com/in/smk692',
      email: 'smk2692@gmail.com',
      resume: '/resume/',
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
        date: '2021.03 ~ 현재',
        activity: '(주)펫프렌즈 | 팀장 (인터널서비스팀) - 물류/발주/판매자/정산/WMS/광고 플랫폼 개발 및 인프라 관리',
        links: {},
      },
      {
        date: '2018.10 ~ 2021.02',
        activity: '주식회사 동그라미소프트 | 백엔드 개발자 - 삼성전자 B2B 프로젝트 (GEHS, IRP, ERP)',
        links: {},
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
        title: '광고 플랫폼 내재화',
        description:
          '외부 광고 플랫폼(CitrusAD) 의존도를 제거하고 자체 광고 시스템 구축. Kafka Streams 기반 실시간 이벤트 파이프라인, Gumbel Top-k 알고리즘 광고 랭킹, OpenSearch 읽기/쓰기 인덱스 분리 설계.',
        techStack: ['Java', 'Spring Boot', 'Kafka Streams', 'OpenSearch', 'DocumentDB', 'Terraform'],
        thumbnailUrl: '',
        links: {},
      },
      {
        title: 'WMS 창고관리시스템 내재화',
        description:
          '외부 솔루션(월 900만원) 대체. DDD 기반 107개 테이블 설계, Timf 3PL 9개 센터 연동, 34만건 재고 실시간 동기화. MSK Producer/Consumer 설계, Terraform 모듈화.',
        techStack: ['Java 17', 'Spring Boot 3', 'JPA', 'MSK (Kafka)', 'Terraform', 'DynamoDB'],
        thumbnailUrl: '',
        links: {},
      },
      {
        title: '인프라 현대화',
        description:
          'EKS Terraform → GitOps Bridge 전환, IRSA → Pod Identity 보안 강화, Spring Gateway → Fargate 비용 최적화, Claude 기반 Code Review Bot 구현.',
        techStack: ['AWS EKS', 'Terraform', 'GitOps', 'Prometheus', 'Grafana'],
        thumbnailUrl: '',
        links: {},
      },
      {
        title: '모놀리틱 → MSA 전환',
        description:
          '5개 서비스(mobile, admin, rider, partner, worker) Repository 분리. 상용 배포 시간 20분 → 4분으로 80% 단축. Docker, CircleCI, CodeDeploy 연동.',
        techStack: ['Node.js', 'CircleCI', 'CodeDeploy', 'Docker', 'GitHub'],
        thumbnailUrl: '',
        links: {},
      },
      {
        title: '개발 블로그',
        description:
          'Gatsby v5 기반 기술 블로그. 스크롤 진행률, TOC 하이라이트, 코드 복사, 이미지 라이트박스, 키보드 단축키 등 다양한 기능 구현.',
        techStack: ['Gatsby', 'React', 'GraphQL', 'GitHub Pages'],
        thumbnailUrl: 'blog.png',
        links: {
          post: '/gatsby-starter-soncoding-introduction',
          github: 'https://github.com/smk692/smk692.github.io',
        },
      },
    ],
  },
};
