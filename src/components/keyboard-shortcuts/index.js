import { useEffect } from 'react';
import { navigate } from 'gatsby';

function KeyboardShortcuts({ prevSlug, nextSlug }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in input/textarea
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      switch (e.key) {
        case 'j':
        case 'ArrowRight':
          if (nextSlug) navigate(nextSlug);
          break;
        case 'k':
        case 'ArrowLeft':
          if (prevSlug) navigate(prevSlug);
          break;
        case '/':
          e.preventDefault();
          const searchInput = document.querySelector('.post-search input');
          if (searchInput) searchInput.focus();
          break;
        case 'h':
          navigate('/');
          break;
        case 'Escape':
          if (document.activeElement) document.activeElement.blur();
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [prevSlug, nextSlug]);

  return null;
}

export default KeyboardShortcuts;
