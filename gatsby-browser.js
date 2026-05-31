require('typeface-montserrat');

const { renderMermaid, setupMermaidThemeObserver } = require('./src/utils/render-mermaid');

exports.onInitialClientRender = () => {
  setupMermaidThemeObserver();
  renderMermaid();
};

exports.onRouteUpdate = () => {
  // 라우트 전환 후 DOM 페인트가 끝난 뒤 렌더
  setTimeout(renderMermaid, 0);
};
