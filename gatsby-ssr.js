const React = require('react');

// 전역 웹폰트 주입
// - Gaegu(개구체): 메뉴/제목용 귀여운 손글씨
// - Gowun Dodum(고운돋움): 본문용 가독성 폰트
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
      key="gf-diary-fonts"
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Gaegu:wght@300;400;700&family=Gowun+Dodum&display=swap"
    />,
  ]);
};
