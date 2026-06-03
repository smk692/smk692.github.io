import React from 'react';
import { graphql, Link } from 'gatsby';
import Layout from '../layout';
import Seo from '../components/seo';
import './archive.scss';

function ArchivePage({ data }) {
  const posts = data.allMarkdownRemark.edges;

  // 연도별로 그룹화
  const postsByYear = posts.reduce((acc, { node }) => {
    const year = new Date(node.frontmatter.rawDate).getFullYear();
    if (!acc[year]) acc[year] = [];
    acc[year].push(node);
    return acc;
  }, {});

  const years = Object.keys(postsByYear).sort((a, b) => b - a);

  return (
    <Layout>
      <div className="archive-page">
        <h1 className="archive-title">아카이브</h1>
        <p className="archive-subtitle">
          총 {posts.length}개의 포스트
        </p>

        {years.map((year) => (
          <div key={year} className="archive-year-section">
            <h2 className="archive-year">
              {year}
              <span className="archive-year-count">
                {postsByYear[year].length}개
              </span>
            </h2>
            <ul className="archive-list">
              {postsByYear[year].map((post) => (
                <li key={post.fields.slug} className="archive-item">
                  <span className="archive-date">
                    {post.frontmatter.date}
                  </span>
                  <Link to={post.fields.slug} className="archive-link">
                    <span className="archive-emoji">
                      {post.frontmatter.emoji || '📄'}
                    </span>
                    {post.frontmatter.title}
                  </Link>
                  <span className="archive-category">
                    {post.frontmatter.categories}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Layout>
  );
}

export default ArchivePage;

export const Head = () => <Seo title="Archive" />;

export const pageQuery = graphql`
  query {
    allMarkdownRemark(sort: { frontmatter: { date: DESC } }) {
      edges {
        node {
          frontmatter {
            title
            date(formatString: "MM.DD")
            rawDate: date
            categories
            emoji
          }
          fields {
            slug
          }
        }
      }
    }
  }
`;
