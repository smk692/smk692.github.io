import { Link } from 'gatsby';
import React from 'react';
import './style.scss';

function PageFooter({ author, githubUrl }) {
  return (
    <footer className="page-footer-wrapper">
      <nav className="footer-links">
        <Link to="/about">about</Link>
        <Link to="/posts">posts</Link>
        <Link to="/archive">archive</Link>
        <a href="/rss.xml" target="_blank" rel="noopener noreferrer">
          RSS
        </a>
      </nav>
      <p className="page-footer">
        © {new Date().getFullYear()}
        &nbsp;
        <a href={githubUrl}>{author}</a>
        &nbsp;· powered by
        <a href="https://github.com/smk692/smk692.github.io">
          &nbsp;son-coding-blog
        </a>
      </p>
    </footer>
  );
}

export default PageFooter;
