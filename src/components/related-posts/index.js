import React from 'react';
import { Link } from 'gatsby';
import './style.scss';

function RelatedPosts({ posts, currentSlug }) {
  const filteredPosts = posts
    .filter((post) => post.slug !== currentSlug)
    .slice(0, 3);

  if (filteredPosts.length === 0) return null;

  return (
    <div className="related-posts">
      <h3 className="related-posts-title">관련 포스트</h3>
      <div className="related-posts-list">
        {filteredPosts.map((post) => (
          <Link key={post.slug} to={post.slug} className="related-post-item">
            <span className="related-post-emoji">{post.emoji || '📄'}</span>
            <div className="related-post-content">
              <span className="related-post-title">{post.title}</span>
              <span className="related-post-date">{post.date}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default RelatedPosts;
