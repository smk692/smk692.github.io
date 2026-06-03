import React, { useEffect, useState } from 'react';
import { graphql } from 'gatsby';
import Layout from '../layout';
import Seo from '../components/seo';
import PostHeader from '../components/post-header';
import PostNavigator from '../components/post-navigator';
import Post from '../models/post';
import PostContent from '../components/post-content';
import Utterances from '../components/utterances';
import CodeCopyButton from '../components/code-copy-button';
import ScrollProgressBar from '../components/scroll-progress-bar';
import ShareButtons from '../components/share-buttons';
import TocHighlight from '../components/toc-highlight';
import ImageLightbox from '../components/image-lightbox';
import KeyboardShortcuts from '../components/keyboard-shortcuts';
import RelatedPosts from '../components/related-posts';
import SeriesNav from '../components/series-nav';

function BlogTemplate({ data, pageContext }) {
  const [viewCount, setViewCount] = useState(null);

  const curPost = new Post(data.cur);
  const prevPost = data.prev && new Post(data.prev);
  const nextPost = data.next && new Post(data.next);
  const { siteUrl, comments } = data.site?.siteMetadata;
  const utterancesRepo = comments?.utterances?.repo;

  // 관련 포스트 (같은 카테고리)
  const relatedPosts = data.related?.edges
    ?.map(({ node }) => ({
      slug: node.fields.slug,
      title: node.frontmatter.title,
      date: node.frontmatter.date,
      emoji: node.frontmatter.emoji,
    }))
    .filter((post) => post.slug !== curPost.slug)
    .slice(0, 3) || [];

  useEffect(() => {
    if (!siteUrl) return;
    // 도메인의 점을 하이픈으로 치환해 카운터 네임스페이스로 사용
    const namespace = siteUrl
      .replace(/(^\w+:|^)\/\//, '')
      .replace(/\./g, '-');
    const key = curPost.slug.replace(/\//g, '') || 'home';
    // Abacus(countapi.xyz 대체): dev=get(증가X), prod=hit(증가)
    fetch(
      `https://abacus.jasoncameron.dev/${
        process.env.NODE_ENV === 'development' ? 'get' : 'hit'
      }/${namespace}/${key}`,
    ).then(async (result) => {
      const data = await result.json();
      if (typeof data.value === 'number') setViewCount(data.value);
    }).catch(() => {});
  }, [siteUrl, curPost.slug]);

  const postUrl = siteUrl ? `${siteUrl}${curPost.slug}` : '';

  return (
    <Layout>
      <ScrollProgressBar />
      <KeyboardShortcuts
        prevSlug={prevPost?.slug}
        nextSlug={nextPost?.slug}
      />
      <PostHeader post={curPost} viewCount={viewCount} />
      <PostContent html={curPost.html} />
      <CodeCopyButton />
      <TocHighlight />
      <ImageLightbox />
      {pageContext?.series && (
        <SeriesNav
          seriesName={pageContext.series}
          posts={pageContext.seriesPosts}
          currentSlug={curPost.slug}
        />
      )}
      <ShareButtons title={curPost.title} url={postUrl} />
      {relatedPosts.length > 0 && (
        <RelatedPosts posts={relatedPosts} currentSlug={curPost.slug} />
      )}
      <PostNavigator prevPost={prevPost} nextPost={nextPost} />
      {utterancesRepo && <Utterances repo={utterancesRepo} path={curPost.slug} />}
    </Layout>
  );
}

export default BlogTemplate;

export const Head = ({ data }) => {
  const post = new Post(data.cur);
  return <Seo title={post.title} description={post.excerpt} />;
};

export const pageQuery = graphql`
  query($slug: String, $nextSlug: String, $prevSlug: String) {
    cur: markdownRemark(fields: { slug: { eq: $slug } }) {
      id
      html
      excerpt(pruneLength: 500, truncate: true)
      frontmatter {
        date(formatString: "MMMM DD, YYYY")
        title
        categories
        author
        emoji
      }
      fields {
        slug
      }
    }

    next: markdownRemark(fields: { slug: { eq: $nextSlug } }) {
      id
      html
      frontmatter {
        date(formatString: "MMMM DD, YYYY")
        title
        categories
        author
        emoji
      }
      fields {
        slug
      }
    }

    prev: markdownRemark(fields: { slug: { eq: $prevSlug } }) {
      id
      html
      frontmatter {
        date(formatString: "MMMM DD, YYYY")
        title
        categories
        author
        emoji
      }
      fields {
        slug
      }
    }

    related: allMarkdownRemark(
      sort: { frontmatter: { date: DESC } }
      limit: 6
    ) {
      edges {
        node {
          frontmatter {
            title
            date(formatString: "MMMM DD, YYYY")
            emoji
          }
          fields {
            slug
          }
        }
      }
    }

    site {
      siteMetadata {
        siteUrl
        comments {
          utterances {
            repo
          }
        }
      }
    }
  }
`;
