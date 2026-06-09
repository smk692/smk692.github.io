const { NODE_ENV, CONTEXT: NETLIFY_ENV = NODE_ENV } = process.env;

const metaConfig = require('./gatsby-meta-config');

module.exports = {
  siteMetadata: metaConfig,

  plugins: [
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `assets`,
        path: `${__dirname}/assets`,
      },
    },
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `content`,
        path: `${__dirname}/content`,
      },
    },
    {
      resolve: 'gatsby-plugin-robots-txt',
      options: {
        resolveEnv: () => NETLIFY_ENV,
        env: {
          production: {
            policy: [{ userAgent: '*' }],
          },
          'branch-deploy': {
            policy: [{ userAgent: '*', disallow: ['/'] }],
            sitemap: null,
            host: null,
          },
          'deploy-preview': {
            policy: [{ userAgent: '*', disallow: ['/'] }],
            sitemap: null,
            host: null,
          },
        },
      },
    },
    {
      resolve: `gatsby-plugin-google-gtag`,
      options: {
        trackingIds: [metaConfig.ga],
        gtagConfig: {
          anonymize_ip: true,
        },
        pluginConfig: {
          head: true,
        },
      },
    },
    {
      resolve: `gatsby-plugin-manifest`,
      options: {
        name: metaConfig.title,
        short_name: metaConfig.title,
        description: metaConfig.description,
        lang: `en`,
        display: `standalone`,
        start_url: `/`,
        icon: `static/favicon.png`,
      },
    },
    {
      resolve: `gatsby-transformer-remark`,
      options: {
        plugins: [
          {
            resolve: `gatsby-remark-images`,
            options: {
              maxWidth: 720,
              linkImagesToOriginal: false,
              backgroundColor: 'transparent',
            },
          },
          {
            resolve: `gatsby-remark-table-of-contents`,
            options: {
              exclude: 'Table of Contents',
              tight: false,
              ordered: false,
              fromHeading: 2,
              toHeading: 6,
              className: 'table-of-contents',
            },
          },
          {
            resolve: `gatsby-remark-prismjs`,
            options: {
              classPrefix: 'language-',
              inlineCodeMarker: null,
              aliases: {
                cql: 'sql',
                rego: 'json',
              },
              showLineNumbers: false,
              noInlineHighlight: false,
              languageExtensions: [
                {
                  language: 'superscript',
                  extend: 'javascript',
                  definition: {
                    superscript_types: /(SuperType)/,
                  },
                  insertBefore: {
                    function: {
                      superscript_keywords: /(superif|superelse)/,
                    },
                  },
                },
              ],
              prompt: {
                user: 'root',
                host: 'localhost',
                global: false,
              },
              escapeEntities: {},
            },
          },
          `gatsby-remark-autolink-headers`,
          `gatsby-remark-copy-linked-files`,
          `gatsby-remark-smartypants`,
        ],
      },
    },
    `gatsby-transformer-sharp`,
    `gatsby-plugin-sitemap`,
    `gatsby-plugin-sharp`,
    `gatsby-plugin-image`,
    // 기존 gatsby-plugin-offline이 설치한 Service Worker가 옛 JS 청크를 캐싱해
    // 새 배포 후 ChunkLoadError(빈 화면)를 유발하던 문제를 해결하기 위해 교체.
    // 이 플러그인은 기존 SW를 unregister하고 캐시를 비운다.
    `gatsby-plugin-remove-serviceworker`,
    `gatsby-plugin-sass`,
    {
      resolve: `gatsby-plugin-feed`,
      options: {
        query: `
          {
            site {
              siteMetadata {
                title
                description
                siteUrl
              }
            }
          }
        `,
        feeds: [
          {
            serialize: ({ query: { site, allMarkdownRemark } }) => {
              return allMarkdownRemark.edges.map(({ node }) => {
                return {
                  title: node.frontmatter.title,
                  description: node.excerpt,
                  date: node.frontmatter.date,
                  url: site.siteMetadata.siteUrl + node.fields.slug,
                  guid: site.siteMetadata.siteUrl + node.fields.slug,
                  custom_elements: [{ 'content:encoded': node.html }],
                };
              });
            },
            query: `
              {
                allMarkdownRemark(sort: { frontmatter: { date: DESC } }) {
                  edges {
                    node {
                      excerpt
                      html
                      fields {
                        slug
                      }
                      frontmatter {
                        title
                        date
                      }
                    }
                  }
                }
              }
            `,
            output: '/rss.xml',
            title: metaConfig.title + ' RSS Feed',
          },
        ],
      },
    },
  ],
};
