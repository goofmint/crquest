/**
 * Store contract.
 *
 * Wraps `electron-store` 6.0.0 as it is used today: `new Store()` with no
 * arguments (src/js/app/components/context_provider/ContextProvider.jsx,
 * src/js/app/common/context/index.js, src/js/app/common/audio/index.js,
 * src/js/app/components/ClearDataButton.jsx). Each of those creates its own
 * instance; all instances read and write the same default file
 * (config.json in Electron's userData directory), so they share data.
 *
 * Keys are top-level keys only (for example 'audio' or a saveToDisk schema
 * field name). Dot-path access is not part of this contract. Values must be
 * JSON-serializable.
 *
 * `clearInvalidConfig` is not set by any caller, so electron-store keeps its
 * own default behavior for an invalid config file; the platform layer adds
 * nothing.
 *
 * Caller responsibilities that stay outside this contract: the truthy check
 * when restoring saved fields (ContextProvider.jsx), choosing which fields are
 * saved or kept on "clear progress" (schema meta), and the audio default state
 * when `get('audio')` is `undefined`. Out of scope: `clear`, `store`, `size`,
 * `onDidChange`, `openInEditor`, and the electron-store constructor options.
 *
 * @typedef {Object} PlatformStore
 * @property {(key: string) => *} get
 *   Synchronous. Returns the stored value, or `undefined` when the key does
 *   not exist (no default is applied).
 * @property {(key: string, value: *) => void} set
 *   Synchronous. Persists the value. Throws a TypeError for a value that
 *   cannot be serialized to JSON (for example `undefined` or a function).
 * @property {(key: string) => boolean} has
 *   Synchronous. True if the key exists.
 * @property {(key: string) => void} delete
 *   Synchronous. Removes the key; deleting a missing key is not an error.
 */
