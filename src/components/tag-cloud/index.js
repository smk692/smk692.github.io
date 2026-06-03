import React from 'react';
import { Link } from 'gatsby';
import './style.scss';

function TagCloud({ tags }) {
  if (!tags || tags.length === 0) return null;

  // 태그별 빈도 계산
  const tagCounts = tags.reduce((acc, tag) => {
    acc[tag] = (acc[tag] || 0) + 1;
    return acc;
  }, {});

  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const maxCount = Math.max(...sortedTags.map(([, count]) => count));
  const minCount = Math.min(...sortedTags.map(([, count]) => count));

  const getSize = (count) => {
    if (maxCount === minCount) return 1;
    const normalized = (count - minCount) / (maxCount - minCount);
    return 0.8 + normalized * 0.6; // 0.8 ~ 1.4 범위
  };

  return (
    <div className="tag-cloud">
      <h3 className="tag-cloud-title">태그</h3>
      <div className="tag-cloud-list">
        {sortedTags.map(([tag, count]) => (
          <Link
            key={tag}
            to={`/posts/${tag}`}
            className="tag-cloud-item"
            style={{ fontSize: `${getSize(count)}rem` }}
          >
            #{tag}
            <span className="tag-count">{count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default TagCloud;
