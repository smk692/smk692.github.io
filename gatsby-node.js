const { createFilePath } = require(`gatsby-source-filesystem`);

/**
 * 읽기 시간 계산 (한국어 기준 분당 500자)
 */
const calculateReadingTime = (content) => {
  const text = content.replace(/<[^>]*>/g, '').replace(/```[\s\S]*?```/g, '');
  const charCount = text.replace(/\s/g, '').length;
  return Math.max(1, Math.round(charCount / 500));
};

/**
 * 키워드 추출 (제목 + 카테고리 + 태그 기반)
 */
const extractKeywords = (frontmatter) => {
  const keywords = new Set();

  // 제목에서 키워드 추출
  if (frontmatter.title) {
    frontmatter.title.split(/\s+/).forEach(word => {
      if (word.length > 2) keywords.add(word.toLowerCase());
    });
  }

  // 카테고리 추가
  if (frontmatter.categories) {
    frontmatter.categories.split(' ').forEach(cat => keywords.add(cat.toLowerCase()));
  }

  // 태그 추가
  if (frontmatter.tags) {
    frontmatter.tags.split(' ').forEach(tag => keywords.add(tag.toLowerCase()));
  }

  return Array.from(keywords).slice(0, 10);
};

exports.onCreateNode = ({ node, getNode, actions }) => {
  const { createNodeField } = actions;

  if (node.internal.type === `MarkdownRemark`) {
    const slug = createFilePath({ node, getNode, basePath: `content` });

    // 기본 slug
    createNodeField({ node, name: `slug`, value: slug });

    // 읽기 시간 (frontmatter에 없으면 자동 계산)
    const readingTime = node.frontmatter.readingTime || calculateReadingTime(node.rawMarkdownBody || '');
    createNodeField({ node, name: `readingTime`, value: readingTime });

    // 키워드 (SEO용)
    const keywords = extractKeywords(node.frontmatter);
    createNodeField({ node, name: `keywords`, value: keywords });

    // 시리즈 정보
    if (node.frontmatter.series) {
      createNodeField({ node, name: `series`, value: node.frontmatter.series });
    }

    // 업데이트 날짜 (있으면 사용, 없으면 생성일)
    const updatedDate = node.frontmatter.updatedDate || node.frontmatter.date;
    createNodeField({ node, name: `updatedDate`, value: updatedDate });
  }
};

const createBlogPages = ({ createPage, results }) => {
  const blogPostTemplate = require.resolve(`./src/templates/blog-template.js`);
  const edges = results.data.allMarkdownRemark.edges;

  edges.forEach(({ node, next, previous }) => {
    // 같은 시리즈의 포스트 찾기
    const seriesPosts = node.frontmatter.series
      ? edges
          .filter(({ node: n }) => n.frontmatter.series === node.frontmatter.series)
          .map(({ node: n }) => ({
            slug: n.fields.slug,
            title: n.frontmatter.title,
            date: n.frontmatter.date,
          }))
      : [];

    createPage({
      path: node.fields.slug,
      component: blogPostTemplate,
      context: {
        slug: node.fields.slug,
        nextSlug: next?.fields.slug ?? '',
        prevSlug: previous?.fields.slug ?? '',
        // 추가 컨텍스트
        readingTime: node.fields.readingTime,
        keywords: node.fields.keywords,
        series: node.frontmatter.series || null,
        seriesPosts: seriesPosts,
        updatedDate: node.fields.updatedDate,
      },
    });
  });
};

const createPostsPages = ({ createPage, results }) => {
  const categoryTemplate = require.resolve(`./src/templates/category-template.js`);
  const categorySet = new Set(['All']);
  const { edges } = results.data.allMarkdownRemark;

  edges.forEach(({ node }) => {
    const postCategories = node.frontmatter.categories.split(' ');
    postCategories.forEach((category) => categorySet.add(category));
  });

  const categories = [...categorySet];

  createPage({
    path: `/posts`,
    component: categoryTemplate,
    context: { currentCategory: 'All', edges, categories },
  });

  categories.forEach((currentCategory) => {
    createPage({
      path: `/posts/${currentCategory}`,
      component: categoryTemplate,
      context: {
        currentCategory,
        categories,
        edges: edges.filter(({ node }) => node.frontmatter.categories.includes(currentCategory)),
      },
    });
  });
};

// 시리즈 페이지 생성
const createSeriesPages = ({ createPage, results }) => {
  const { edges } = results.data.allMarkdownRemark;
  const seriesMap = new Map();

  // 시리즈별 포스트 그룹화
  edges.forEach(({ node }) => {
    if (node.frontmatter.series) {
      const series = node.frontmatter.series;
      if (!seriesMap.has(series)) {
        seriesMap.set(series, []);
      }
      seriesMap.set(series, [...seriesMap.get(series), node]);
    }
  });

  // 시리즈 목록 페이지는 추후 구현
  // seriesMap.forEach((posts, seriesName) => { ... });
};

exports.createPages = async ({ actions, graphql, reporter }) => {
  const { createPage } = actions;

  const results = await graphql(`
    {
      allMarkdownRemark(sort: { frontmatter: { date: DESC } }, limit: 1000) {
        edges {
          node {
            id
            excerpt(pruneLength: 120, truncate: true)
            rawMarkdownBody
            fields {
              slug
              readingTime
              keywords
              updatedDate
            }
            frontmatter {
              categories
              title
              emoji
              date(formatString: "MMMM DD, YYYY")
              series
              tags
            }
          }
          next {
            fields {
              slug
            }
          }
          previous {
            fields {
              slug
            }
          }
        }
      }
    }
  `);

  // Handle errors
  if (results.errors) {
    reporter.panicOnBuild(`Error while running GraphQL query.`);
    return;
  }

  createBlogPages({ createPage, results });
  createPostsPages({ createPage, results });
  createSeriesPages({ createPage, results });
};

// 스키마 커스터마이징 (선택적 필드 정의)
exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions;

  createTypes(`
    type MarkdownRemarkFrontmatter {
      series: String
      readingTime: Int
      updatedDate: Date @dateformat
      keywords: [String]
      thumbnail: String
    }

    type MarkdownRemarkFields {
      slug: String!
      readingTime: Int
      keywords: [String]
      series: String
      updatedDate: String
    }
  `);
};
