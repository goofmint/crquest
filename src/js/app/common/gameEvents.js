// Mission objective completion is not reported anywhere: the former event
// endpoint is gone, and the server certifies achievements itself
// (docs/supabase/certification.md). Kept as a no-op so that the Validator's
// call site does not change.
async function logMissionObjectiveCompletion(context, liveEvent) {}

export default {
  logMissionObjectiveCompletion,
};
