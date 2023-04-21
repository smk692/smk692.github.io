import React from 'react';
import './style.scss';

function PageFooter({ author, githubUrl }) {
  return (
    <footer className="page-footer-wrapper">
      <p className="page-footer">
        © {new Date().getFullYear()}
        &nbsp;
        <a href={githubUrl}>{author}</a>
        &nbsp;powered by
        <a href="https://github.com/smk692/smk692.github.io">
          &nbsp;son-coding-blog
        </a>
      </p>
    </footer>
  );
}

export default PageFooter;
