import { Link } from 'gatsby';
import React from 'react';
import './style.scss';

function PostCard({ post }) {
  const { id, slug, title, excerpt, date, categories, emoji, readingTime } = post;
  return (
    <div className="post-card-wrapper">
      <Link className="post-card" key={id} to={slug}>
        <div className="title-row">
          <span className="emoji-sticker">{emoji || '📝'}</span>
          <div className="title">{title}</div>
        </div>
        <p className="description" dangerouslySetInnerHTML={{ __html: excerpt }} />
        <div className="info">
          <div className="date">
            {date}
            {readingTime ? ` · ${readingTime}분 읽기` : ''}
          </div>
          <div className="categories">
            {categories.map((category) => (
              <div className="category" key={category}>
                {category}
              </div>
            ))}
          </div>
        </div>
      </Link>
    </div>
  );
}

export default PostCard;
