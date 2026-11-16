const path = require('path');
const { PollyClient } = require('@aws-sdk/client-polly');
const parseOptions = require('./parse_options');
const writeSpeechFilesForConversation = require('./write_files');
const buildFileList = require('./build_file_list');
const getStatementsFromConversationFile = require('./read_conversation_files');

const options = parseOptions();

console.log(options);

const { missions, fileFilter } = options;

const conversationFilePaths = buildFileList(missions, fileFilter);

console.log(
  'Creating voice overs for the following files (if they have statements):'
);
console.log(conversationFilePaths);

// Create single AWS Polly client (credentials come from the default AWS
// credential provider chain)
const polly = new PollyClient({ region: 'us-east-1' });

(async () => {
  for (const filePath of conversationFilePaths) {
    const statements = getStatementsFromConversationFile(filePath);

    await writeSpeechFilesForConversation(
      polly,
      statements,
      path.dirname(filePath),
      path.basename(filePath)
    );
  }
})().catch(err => {
  console.error('Failed to generate voice overs.');
  console.error(err);
  process.exitCode = 1;
});
