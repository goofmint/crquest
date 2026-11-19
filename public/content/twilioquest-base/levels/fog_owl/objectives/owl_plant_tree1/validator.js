module.exports = async helper => {
  try {
    const baseUrl = 'https://twilioquest-prod.firebaseapp.com';
    const response = await fetch(`${baseUrl}/quest/tracking/trees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        analyticsId: helper.analyticsId,
        createdAt: new Date(),
        missionName: 'owl',
        objectiveName: 'owl_plant_tree1',
        playerName: helper.context.settings.name,
      })
    });

    if (response.ok) {
      // 204 indicates success
      helper.success(helper.t('planted', `
        Thanks for helping plant a tree in Australia!
      `));
    } else {
      if (response.status === 403) {
        return helper.success(helper.t('alreadyPlanted', `
          You've already planted this tree - good for you!
        `));
      } else {
        return helper.fail(helper.t('requestFailed', `
          Sorry, something went wrong submitting your request. Try again later!
        `));
      }
    }
  } catch (err) {
    console.log(err);
    helper.fail(helper.t('failed',
      `Something went wrong when we tried to plant a tree on your behalf:
      <br/></br/>
      {{error}}`,
      { error: err }
    ));
  }
};
