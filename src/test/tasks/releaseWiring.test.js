const fs = require('fs');
const os = require('os');
const path = require('path');
const { stageTauriFrontend } = require('../../../tasks/stage_tauri_frontend');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const pkg = require('../../../package.json');

describe('release wiring', () => {
  it('release builds the Tauri bundle directly', () => {
    expect(pkg.scripts.release).toBe('tauri build');
  });

  it('ci installs the app dependencies and then releases', () => {
    expect(pkg.scripts.ci).toBe('npm-run-all install:app release');
  });

  it('no longer has the Firebase tarball release script', () => {
    expect(
      fs.existsSync(path.join(repoRoot, 'tasks', 'create_release.js'))
    ).toBe(false);
  });

  it('beforeBuildCommand builds the frontend', () => {
    const conf = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'src-tauri', 'tauri.conf.json'),
        'utf8'
      )
    );
    expect(conf.build.beforeBuildCommand).toBe('npm run build:tauri');
  });

  it.each(['git-branch', 'md5-file', 'modclean', 'tar', 'aws-sdk'])(
    'does not depend on %s',
    name => {
      expect(pkg.dependencies[name]).toBeUndefined();
      expect(pkg.devDependencies[name]).toBeUndefined();
    }
  );
});

test('stages optional Koromame fonts and prefers WOFF2', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'terminalquest-fonts-'));
  try {
    const source = path.join(temp, 'public');
    const target = path.join(temp, 'tauri-dist');
    const animateDirectory = path.join(source, 'node_modules', 'animate.css');
    fs.mkdirSync(animateDirectory, { recursive: true });
    fs.writeFileSync(path.join(animateDirectory, 'animate.min.css'), '');
    fs.writeFileSync(path.join(source, 'index.css'), 'body {}');

    stageTauriFrontend(source, target, temp);
    const stylesheet = path.join(target, 'index.css');
    expect(fs.readFileSync(stylesheet, 'utf8')).toBe('body {}');
    expect(fs.existsSync(path.join(target, 'fonts'))).toBe(false);

    const woff2 = 'Koromame-Regular.woff2';
    const ttf = 'Koromame-Regular.ttf';
    fs.writeFileSync(path.join(temp, woff2), 'woff2 test data');
    fs.writeFileSync(path.join(temp, ttf), 'ttf test data');
    stageTauriFrontend(source, target, temp);

    expect(fs.readFileSync(stylesheet, 'utf8')).toContain(
      `url('fonts/${woff2}') format('woff2'), url('fonts/${ttf}') format('truetype')`
    );
    expect(fs.readFileSync(path.join(target, 'fonts', woff2), 'utf8')).toBe('woff2 test data');
    expect(fs.readFileSync(path.join(target, 'fonts', ttf), 'utf8')).toBe('ttf test data');
    expect(fs.readFileSync(path.join(source, 'index.css'), 'utf8')).toBe('body {}');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
