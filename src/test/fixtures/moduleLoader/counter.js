globalThis.__moduleLoaderFixtureEvaluations =
  (globalThis.__moduleLoaderFixtureEvaluations || 0) + 1;
module.exports = { evaluations: globalThis.__moduleLoaderFixtureEvaluations };
