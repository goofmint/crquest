// The credentials are only checked for their format. They are NOT sent to the
// Twilio API (the game no longer depends on the `twilio` package or on network
// access to Twilio for this objective).
const ACCOUNT_SID_FORMAT = /^AC[0-9a-f]{32}$/i;
const AUTH_TOKEN_FORMAT = /^[0-9a-f]{32}$/i;

module.exports = (context, callback) => {
  const { accountSid, authToken } = context.validationFields;

  if (!accountSid || !authToken) {
    return callback({
      message: `An Account SID and Auth Token are required - please enter them in the text fields provided.`,
    });
  }

  if (!ACCOUNT_SID_FORMAT.test(accountSid)) {
    return callback({
      message: `A valid account SID is required - it starts with an "AC" followed by 32 hexadecimal characters (34 characters in total).`,
    });
  }

  if (!AUTH_TOKEN_FORMAT.test(authToken)) {
    return callback({
      message: `A valid auth token is required - it is 32 hexadecimal characters.`,
    });
  }

  callback(null, {
    message: `Your credentials are approved. The Statue of Truth will save them for later.`,
    env: [
      { name: 'TWILIO_ACCOUNT_SID', value: accountSid },
      { name: 'TWILIO_AUTH_TOKEN', value: authToken, concealed: true },
    ],
  });
};
