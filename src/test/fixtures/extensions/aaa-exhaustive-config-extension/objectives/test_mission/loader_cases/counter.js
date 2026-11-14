// Counts how many times this file is evaluated (to observe cache eviction).
globalThis.__requireFromExtensionEvaluations =
  (globalThis.__requireFromExtensionEvaluations || 0) + 1;

module.exports = globalThis.__requireFromExtensionEvaluations;
