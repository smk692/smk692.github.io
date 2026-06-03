import React, { useState, useEffect, useCallback } from 'react';
import './style.scss';

function ImageLightbox() {
  const [isOpen, setIsOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState('');
  const [imageAlt, setImageAlt] = useState('');

  const openLightbox = useCallback((e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.closest('.markdown')) {
      setImageSrc(img.src);
      setImageAlt(img.alt || '');
      setIsOpen(true);
      document.body.style.overflow = 'hidden';
    }
  }, []);

  const closeLightbox = useCallback(() => {
    setIsOpen(false);
    document.body.style.overflow = '';
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape' && isOpen) {
        closeLightbox();
      }
    },
    [isOpen, closeLightbox]
  );

  useEffect(() => {
    const markdownContent = document.querySelector('.markdown');
    if (markdownContent) {
      markdownContent.addEventListener('click', openLightbox);
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      if (markdownContent) {
        markdownContent.removeEventListener('click', openLightbox);
      }
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openLightbox, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="lightbox-overlay" onClick={closeLightbox}>
      <button className="lightbox-close" onClick={closeLightbox} aria-label="Close">
        ✕
      </button>
      <img
        src={imageSrc}
        alt={imageAlt}
        className="lightbox-image"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export default ImageLightbox;
