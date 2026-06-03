import React from 'react';
import './style.scss';

function ShareButtons({ title, url }) {
  const encodedTitle = encodeURIComponent(title);
  const encodedUrl = encodeURIComponent(url);

  const shareLinks = [
    {
      name: 'Twitter',
      icon: '𝕏',
      url: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
      color: '#1da1f2',
    },
    {
      name: 'LinkedIn',
      icon: 'in',
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      color: '#0077b5',
    },
    {
      name: 'Facebook',
      icon: 'f',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      color: '#1877f2',
    },
  ];

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      alert('링크가 복사되었습니다!');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="share-buttons">
      <span className="share-label">공유하기</span>
      <div className="share-icons">
        {shareLinks.map((link) => (
          <a
            key={link.name}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="share-button"
            style={{ '--hover-color': link.color }}
            aria-label={`Share on ${link.name}`}
          >
            {link.icon}
          </a>
        ))}
        <button
          className="share-button copy-link"
          onClick={copyToClipboard}
          aria-label="Copy link"
        >
          🔗
        </button>
      </div>
    </div>
  );
}

export default ShareButtons;
