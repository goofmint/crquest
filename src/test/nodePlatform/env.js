// platform/env for the Vitest run (see vitest.config.mjs): development mode,
// the host OS of the test process.
export function isDev() {
  return true;
}

export function getPlatform() {
  return process.platform;
}
