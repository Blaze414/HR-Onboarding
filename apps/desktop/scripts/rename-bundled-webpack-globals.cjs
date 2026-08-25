/*
 * pdf.js ships as a webpack bundle, so its files declare `__webpack_exports__`
 * and `__webpack_require__` of their own. Nesting one bundle inside another
 * makes those inner declarations shadow the outer runtime's, and the module
 * dies on its first line with `Object.defineProperty called on non-object`.
 *
 * Renaming them is safe because each file is self-contained: every reference
 * to the inner runtime lives in the same file as its declaration.
 *
 * Production never showed this — minification renames the inner names as a
 * side effect — which is exactly why it has to be fixed here rather than left
 * to whichever mode happens to paper over it.
 */
module.exports = function renameBundledWebpackGlobals(source) {
  return source.replace(/\b__webpack_(exports|require)__\b/g, '__bundled_webpack_$1__');
};
