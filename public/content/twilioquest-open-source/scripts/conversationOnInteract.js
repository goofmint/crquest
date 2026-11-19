const observationKeys = new Map([
  [
    "<i>The stoic guardian of the forest calmly acknowledges your presence, but does not seem interested in idle conversation...</i>",
    "observation.guard",
  ],
  [
    "<i>The vendors in the town square have a variety of wares from across The Cloud. You wish you have time to stop and browse.</i>",
    "observation.vendor",
  ],
]);

module.exports = function (self, event, world) {
  if (self !== event.target) {
    // This isn't our conversationalist
    return;
  }

  if (!self.interactable) {
    // Disable conversations when object isn't interactable.
    return;
  }

  if (self.observation) {
    // The "observation" property can be set to have the Operator
    // make an observation about a character without kicking off a convo
    const key = observationKeys.get(self.observation);
    world.showNotification(key ? world.t(key, self.observation) : self.observation);
    return;
  }

  // Default to conversation and ensure appropriate values are set
  const conversationName = self.conversation;
  const conversationAvatar = self.conversationAvatar;

  if (!conversationName) {
    console.error(`"conversationName" property not set on interaction target.`);
    return;
  }

  if (!conversationAvatar) {
    console.error(
      `"conversationAvatar" property not set on interaction target.`
    );
    return;
  }

  // Kick off conversation
  world.startConversation(conversationName, conversationAvatar);
};
