const fs = require('fs');
const path = require('path');

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
