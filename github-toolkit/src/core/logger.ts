export const Logger = {
  prefix: '[GH-Toolkit]',
  log: (...args: any[]) => console.log(Logger.prefix, ...args),
  warn: (...args: any[]) => console.warn(Logger.prefix, ...args),
  error: (...args: any[]) => console.error(Logger.prefix, ...args),
};
