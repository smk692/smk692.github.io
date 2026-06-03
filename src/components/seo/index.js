import { useStaticQuery, graphql } from 'gatsby';
import React from 'react';

export function useSiteMetadata() {
  const { site } = useStaticQuery(
    graphql`
      query {
        site {
          siteMetadata {
            title
            description
            author {
              name
            }
            ogImage
          }
        }
      }
    `,
  );
  return site.siteMetadata;
}

function Seo({ description, title, children }) {
  const siteMetadata = useSiteMetadata();
  const metaDescription = description || siteMetadata.description;
  const defaultTitle = siteMetadata.title;

  return (
    <>
      <html lang="ko" />
      <title>{title ? `${title} | ${defaultTitle}` : defaultTitle}</title>
      <meta name="description" content={metaDescription} />
      <meta property="og:title" content={title || defaultTitle} />
      <meta property="og:site_name" content={defaultTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:author" content={siteMetadata.author.name} />
      <meta property="og:image" content={siteMetadata.ogImage} />
      <meta property="og:type" content="website" />
      {children}
    </>
  );
}

export default Seo;
