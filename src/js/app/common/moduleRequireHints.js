/**
 * Explicit preload hints for `require` calls the loader's static scan cannot
 * see (moduleLoader.js only preloads `require('literal')` calls).
 *
 * The only such call in the bundled content is in
 * `objects/tq-npc/builder.js` (twilioquest-base):
 *
 *   const animations = require(`./animations/${npcName}`);
 *
 * where `npcName` comes from a constant NPC_LIST in that same file. The
 * vendored file is left untouched; instead the specifiers it can produce are
 * listed here so that they are preloaded and resolved like literal requires.
 * Without a hint such a call fails with ERR_MODULE_NOT_PRELOADED.
 *
 * KEEP IN SYNC with NPC_LIST in builder.js. The test
 * src/test/app/common/moduleRequireHints.test.js compares both lists and
 * fails when they differ. Any other non-literal require in new content must
 * get an entry here (src/test/app/content/contentRequires.test.js reports it).
 */

// Matched against the normalized absolute path of the requiring file, so it
// applies to the bundled extension and to a user extension overriding it.
const TQ_NPC_BUILDER_SUFFIX = '/objects/tq-npc/builder.js';

const TQ_NPC_NAMES = Object.freeze([
  'cedric',
  'chiara',
  'corey',
  'craig',
  'fredric_holo',
  'fredric',
  'kevin',
  'marcus',
  'margaret',
  'megan',
  'mica',
  'ryan',
]);

const HINTS = Object.freeze([
  Object.freeze({
    fileSuffix: TQ_NPC_BUILDER_SUFFIX,
    specifiers: Object.freeze(TQ_NPC_NAMES.map(name => `./animations/${name}`)),
  }),
]);

/**
 * @param {string} absolutePath - normalized (`/` separated) absolute path
 * @returns {string[]} extra specifiers to preload for that file
 */
function getExtraRequiresFor(absolutePath) {
  return HINTS.filter(hint => absolutePath.endsWith(hint.fileSuffix)).flatMap(
    hint => hint.specifiers
  );
}

export { TQ_NPC_NAMES, getExtraRequiresFor };
