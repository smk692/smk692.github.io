const React = require('react');

// 전역 웹폰트(나눔고딕) 주입
exports.onRenderBody = ({ setHeadComponents }) => {
  setHeadComponents([
    <link
      key="gf-preconnect"
      rel="preconnect"
      href="https://fonts.googleapis.com"
    />,
    <link
      key="gf-preconnect-gstatic"
      rel="preconnect"
      href="https://fonts.gstatic.com"
      crossOrigin="anonymous"
    />,
    <link
      key="gf-nanum-gothic"
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&display=swap"
    />,
  ]);
};
