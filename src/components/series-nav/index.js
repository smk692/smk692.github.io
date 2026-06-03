import { Link } from 'gatsby';
import React from 'react';
import './style.scss';

function SeriesNav({ seriesName, posts, currentSlug }) {
  if (!seriesName || !posts || posts.length < 2) return null;

  // gatsby-node의 edges가 날짜 DESC라, reverse하면 1편부터(오래된 순)
  const ordered = [...posts].reverse();

  return (
    <nav className="series-nav">
      <div className="series-nav__title">📚 {seriesName} 시리즈</div>
      <ol className="series-nav__list">
        {ordered.map((p, i) => {
          const isCurrent = p.slug === currentSlug;
          return (
            <li key={p.slug} className={isCurrent ? 'current' : ''}>
              {isCurrent ? (
                <span>
                  {i + 1}. {p.title}
                </span>
              ) : (
                <Link to={p.slug}>
                  {i + 1}. {p.title}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default SeriesNav;
