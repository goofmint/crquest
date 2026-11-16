const { SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
const jetpack = require('fs-jetpack');
const { getBaseName } = require('./helpers');

// `polly` is a PollyClient (or anything with a compatible `send`), created by
// the caller so that the credentials and region are configured in one place.
async function writeSpeechFilesForConversation(
  polly,
  statements,
  conversationDirPath,
  conversationFileName
) {
  const voiceOverDirPath = `${conversationDirPath}/vo`;

  jetpack.dir(voiceOverDirPath);

  const baseName = getBaseName(conversationFileName);

  await Promise.all(
    statements.map(async ({ id, text, speech }) => {
      const pollyParams = {
        OutputFormat: 'mp3',
        VoiceId: 'Brian',
        LanguageCode: 'en-GB',
        Text: speech ? `<speak>${speech}</speak>` : text,
        TextType: speech ? 'ssml' : 'text',
      };

      const data = await polly.send(new SynthesizeSpeechCommand(pollyParams));

      if (!data.AudioStream) {
        throw new Error(
          `Polly returned no AudioStream for statement "${id}" in ${conversationFileName}`
        );
      }

      const audio = await data.AudioStream.transformToByteArray();

      jetpack.write(
        `${voiceOverDirPath}/${baseName}_${id}.mp3`,
        Buffer.from(audio)
      );
    })
  );
}

module.exports = writeSpeechFilesForConversation;
