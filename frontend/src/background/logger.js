/**
 * Namespaced logging for background, content, and popup.
 * Use: log.bg.info(), log.popup.warn(), etc.
 */

const noop = () => {};

function createNamespace(prefix) {
  const p = `[EZ-Note ${prefix}]`;
  return {
    debug: typeof console !== 'undefined' && console.debug ? (...args) => console.debug(p, ...args) : noop,
    info: typeof console !== 'undefined' && console.info ? (...args) => console.info(p, ...args) : noop,
    warn: typeof console !== 'undefined' && console.warn ? (...args) => console.warn(p, ...args) : noop,
    error: typeof console !== 'undefined' && console.error ? (...args) => console.error(p, ...args) : noop,
  };
}

export const log = {
  bg: createNamespace('BG'),
  content: createNamespace('Content'),
  popup: createNamespace('Popup'),
};

export default log;
