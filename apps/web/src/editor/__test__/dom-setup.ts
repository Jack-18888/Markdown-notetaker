if (typeof document !== 'undefined' && document.compatMode !== 'CSS1Compat') {
  // Happy DOM initializes without a DOCTYPE; KaTeX requires standards mode at import time.
  Object.defineProperty(document, 'compatMode', {
    value: 'CSS1Compat',
    configurable: true,
  });
}
