// The planting is recorded online when the player is signed in (and queued
// when the server cannot be reached), but completing the objective never
// depends on it: the progress is local first. See docs/supabase/unlocks-and-trees.md.
module.exports = async helper => {
  const result = await helper.recordTreePlanting();

  switch (result) {
    case 'recorded':
      return helper.success(helper.t('planted', `
        Thanks for helping plant a tree in Australia!
      `));
    case 'already_recorded':
      return helper.success(helper.t('alreadyPlanted', `
        You've already planted this tree - good for you!
      `));
    case 'pending':
      return helper.success(helper.t('plantedPending', `
        Your tree is planted and saved on this computer. It will be recorded
        online the next time you are signed in and connected.
      `));
    case 'signed_out':
      return helper.success(helper.t('plantedSignedOut', `
        Your tree is planted and saved on this computer. Sign in (Settings >
        Account) to have your trees recorded online.
      `));
    default:
      return helper.success(helper.t('plantedLocal', `
        Your tree is planted and saved on this computer, but it could not be
        recorded online.
      `));
  }
};
