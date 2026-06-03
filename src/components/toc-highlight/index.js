import { useEffect } from 'react';

function TocHighlight() {
  useEffect(() => {
    const toc = document.querySelector('.table-of-contents');
    if (!toc) return;

    const headings = document.querySelectorAll(
      '.markdown h2[id], .markdown h3[id], .markdown h4[id], .markdown h5[id], .markdown h6[id]'
    );
    if (headings.length === 0) return;

    const tocLinks = toc.querySelectorAll('a');

    const observerOptions = {
      rootMargin: '-80px 0px -70% 0px',
      threshold: 0,
    };

    let currentActiveLink = null;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          const link = toc.querySelector(`a[href="#${id}"]`);

          if (currentActiveLink) {
            currentActiveLink.classList.remove('active');
          }

          if (link) {
            link.classList.add('active');
            currentActiveLink = link;
          }
        }
      });
    }, observerOptions);

    headings.forEach((heading) => observer.observe(heading));

    return () => {
      headings.forEach((heading) => observer.unobserve(heading));
    };
  }, []);

  return null;
}

export default TocHighlight;
