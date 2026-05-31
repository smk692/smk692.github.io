// 클라이언트 사이드 Mermaid 렌더링
// ```mermaid 코드 블록(prism: code.language-mermaid)을 찾아 SVG 다이어그램으로 변환.
// 다크/라이트 테마(data-theme)에 연동되며, 테마 전환 시 자동 재렌더링.

let mermaidPromise;
let renderSeq = 0;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => mod.default || mod);
  }
  return mermaidPromise;
}

function currentMermaidTheme() {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'dark' ? 'dark' : 'default';
}

async function renderOne(mermaid, source, target) {
  const id = `mermaid-svg-${Date.now()}-${renderSeq++}`;
  try {
    const { svg, bindFunctions } = await mermaid.render(id, source);
    target.innerHTML = svg;
    if (typeof bindFunctions === 'function') {
      bindFunctions(target);
    }
  } catch (err) {
    // 문법 오류 등: 원본 소스를 코드 블록으로 노출
    target.innerHTML = '';
    const pre = document.createElement('pre');
    pre.textContent = source;
    target.appendChild(pre);
    // eslint-disable-next-line no-console
    console.error('[mermaid] render failed:', err);
  }
}

export async function renderMermaid() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // 아직 렌더되지 않은 코드 블록
  const codeBlocks = Array.from(
    document.querySelectorAll('pre > code.language-mermaid, code.language-mermaid'),
  ).filter((code) => !code.closest('.mermaid-rendered'));

  // 이미 렌더된 블록(테마 전환 시 재렌더 대상)
  const renderedWrappers = Array.from(document.querySelectorAll('.mermaid-rendered'));

  if (codeBlocks.length === 0 && renderedWrappers.length === 0) return;

  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    theme: currentMermaidTheme(),
    securityLevel: 'loose',
    fontFamily: "'Nanum Gothic', 'Pretendard', sans-serif",
  });

  // 신규 블록 변환
  for (const code of codeBlocks) {
    const pre = code.closest('pre') || code;
    const source = code.textContent;
    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-rendered';
    wrapper.setAttribute('data-mermaid-source', source);
    pre.replaceWith(wrapper);
    // eslint-disable-next-line no-await-in-loop
    await renderOne(mermaid, source, wrapper);
  }

  // 기존 블록 재렌더(테마 반영)
  for (const wrapper of renderedWrappers) {
    const source = wrapper.getAttribute('data-mermaid-source');
    if (!source) continue;
    // eslint-disable-next-line no-await-in-loop
    await renderOne(mermaid, source, wrapper);
  }
}

export function setupMermaidThemeObserver() {
  if (typeof window === 'undefined' || window.__mermaidThemeObserver) return;
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.attributeName === 'data-theme')) {
      renderMermaid();
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.__mermaidThemeObserver = observer;
}
