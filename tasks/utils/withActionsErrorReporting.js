function withActionsErrorReporting(wrappedFunction) {
  return async function() {
    // @actions/core is ESM-only and has no "require" export condition, so it
    // is loaded with a dynamic import().
    const actionsCore = await import('@actions/core');

    try {
      await wrappedFunction();
    } catch (err) {
      actionsCore.setFailed(err.message);
    }
  };
}

module.exports = withActionsErrorReporting;
