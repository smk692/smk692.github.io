import React, { useEffect } from 'react';
import './style.scss';

function CodeCopyButton() {
  useEffect(() => {
    const codeBlocks = document.querySelectorAll('pre[class*="language-"]');

    codeBlocks.forEach((block) => {
      if (block.querySelector('.copy-button')) return;

      const button = document.createElement('button');
      button.className = 'copy-button';
      button.textContent = 'Copy';
      button.setAttribute('aria-label', 'Copy code to clipboard');

      button.addEventListener('click', async () => {
        const code = block.querySelector('code');
        const text = code ? code.textContent : block.textContent;

        try {
          await navigator.clipboard.writeText(text);
          button.textContent = 'Copied!';
          button.classList.add('copied');
          setTimeout(() => {
            button.textContent = 'Copy';
            button.classList.remove('copied');
          }, 2000);
        } catch (err) {
          button.textContent = 'Failed';
          setTimeout(() => {
            button.textContent = 'Copy';
          }, 2000);
        }
      });

      block.style.position = 'relative';
      block.appendChild(button);
    });
  }, []);

  return null;
}

export default CodeCopyButton;
