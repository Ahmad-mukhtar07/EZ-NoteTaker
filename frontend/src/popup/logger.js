/**
 * Namespaced logging for popup. Use log.popup.info(), log.popup.warn(), etc.
 */

const noop = () => {};
const prefix = '[EZ-Note Popup]';

export const log = {
  popup: {
    debug: typeof console !== 'undefined' && console.debug ? (...args) => console.debug(prefix, ...args) : noop,
    info: typeof console !== 'undefined' && console.info ? (...args) => console.info(prefix, ...args) : noop,
    warn: typeof console !== 'undefined' && console.warn ? (...args) => console.warn(prefix, ...args) : noop,
    error: typeof console !== 'undefined' && console.error ? (...args) => console.error(prefix, ...args) : noop,
  },
};
