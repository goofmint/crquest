const fs = require('fs');
const os = require('os');
const path = require('path');

const getStatements = require('../../../tasks/generate_voice_overs/read_conversation_files');
const writeSpeechFiles = require('../../../tasks/generate_voice_overs/write_files');

const mp3Bytes = Uint8Array.from([1, 2, 3]);

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tq-vo-'));
}

function audioStream() {
  return { transformToByteArray: async () => mp3Bytes };
}

describe('read_conversation_files', () => {
  it('extracts id, speech and text from the statements', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'cedric.pug');
    fs.writeFileSync(
      file,
      [
        'conversation',
        '  statements',
        '    statement(id="plain")',
        '      text Hello there',
        '    statement(id="spoken")',
        '      text Hi',
        '      speech Hi, there',
        '',
      ].join('\n')
    );

    expect(getStatements(file)).toEqual([
      { id: 'plain', speech: null, text: 'Hello there' },
      { id: 'spoken', speech: 'Hi, there', text: 'Hi' },
    ]);
  });
});

describe('write_files (Polly)', () => {
  it('sends text and ssml requests and writes <basename>_<id>.mp3', async () => {
    const dir = makeTempDir();
    const sent = [];
    const polly = {
      send: async command => {
        sent.push(command.input);
        return { AudioStream: audioStream() };
      },
    };

    await writeSpeechFiles(
      polly,
      [
        { id: 'a', text: 'Plain', speech: null },
        { id: 'b', text: 'Ignored', speech: 'Spoken' },
      ],
      dir,
      'cedric.pug'
    );

    expect(sent).toEqual([
      {
        OutputFormat: 'mp3',
        VoiceId: 'Brian',
        LanguageCode: 'en-GB',
        Text: 'Plain',
        TextType: 'text',
      },
      {
        OutputFormat: 'mp3',
        VoiceId: 'Brian',
        LanguageCode: 'en-GB',
        Text: '<speak>Spoken</speak>',
        TextType: 'ssml',
      },
    ]);
    expect([...fs.readFileSync(path.join(dir, 'vo', 'cedric_a.mp3'))]).toEqual([
      1,
      2,
      3,
    ]);
    expect(fs.existsSync(path.join(dir, 'vo', 'cedric_b.mp3'))).toBe(true);
  });

  it('rejects when the response has no AudioStream', async () => {
    const polly = { send: async () => ({}) };

    await expect(
      writeSpeechFiles(
        polly,
        [{ id: 'a', text: 'x', speech: null }],
        makeTempDir(),
        'cedric.pug'
      )
    ).rejects.toThrow('statement "a" in cedric.pug');
  });

  it('rejects when Polly rejects', async () => {
    const polly = {
      send: async () => {
        throw new Error('denied');
      },
    };

    await expect(
      writeSpeechFiles(
        polly,
        [{ id: 'a', text: 'x', speech: null }],
        makeTempDir(),
        'cedric.pug'
      )
    ).rejects.toThrow('denied');
  });
});
