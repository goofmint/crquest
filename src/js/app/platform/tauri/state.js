/**
 * Values read once by `initPlatform()` (tauri/init.js) and then served
 * synchronously by `paths` and `env`. Reading before initialization throws:
 * there is no default value.
 */
let state;

export function setPlatformState(value) {
  state = Object.freeze({ ...value });
}

export function getPlatformState(member) {
  if (!state) {
    throw new Error(
      `platform: ${member} was used before initPlatform() finished. Await initPlatform() at startup.`
    );
  }
  return state;
}

/** Test helper: forget the initialized values. */
export function resetPlatformState() {
  state = undefined;
}
