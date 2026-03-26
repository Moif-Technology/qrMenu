/**
 * Logger utility - no-op in production for performance
 * Use instead of console.log/warn/error
 */
const isDev = import.meta.env.DEV;

export const log = (...args) => {
  if (isDev) console.log(...args);
};
export const warn = (...args) => {
  if (isDev) console.warn(...args);
};
export const error = (...args) => {
  if (isDev) console.error(...args);
};
