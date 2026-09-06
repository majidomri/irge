/**
 * X/Twitter uses its own tag, and Next only emits `twitter:image` from a
 * `twitter-image` file — an `opengraph-image` alone leaves it unset. Same
 * artwork, so this re-exports rather than drawing a second one.
 */
export { default, alt, size, contentType } from './opengraph-image';
