// #193: Firebase is gone from runtime code, configuration and dependencies.
// `npm run check:firebase` is the same scan.
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const { findFirebaseReferences, PATTERNS } = require(path.join(repoRoot, 'tasks', 'check_firebase.js'));

const read = file => fs.readFileSync(path.join(repoRoot, file), 'utf8');

describe('Firebase removal (#193)', () => {
  it('has no Firebase host, SDK, former API URL or old variable in runtime code or configuration', () => {
    expect(findFirebaseReferences()).toEqual([]);
  });

  it('flags each kind of reference the guard exists for', () => {
    const samples = [
      "fetch('https://twilioquest-prod.firebaseapp.com/quest/api/v1/teams/joinCode/X')",
      'https://firestore.googleapis.com',
      '<script src="lib/firebase/firebase-app.js"></script>',
      "const { initializeApp } = require('firebase-admin/app');",
      'firebase.initializeApp(config)',
      'process.env.FIREBASE_ADMIN_SA_JSON',
      "await fetch('https://x/quest/tracking/trees')",
    ];
    for (const sample of samples) {
      expect(PATTERNS.some(([, pattern]) => pattern.test(sample)), sample).toBe(true);
    }
    // The content package name is not a host.
    expect(PATTERNS.some(([, pattern]) => pattern.test('twilioquest-dev-fundamentals'))).toBe(false);
  });

  it('does not load a Firebase script in the page', () => {
    expect(read('src/index.html')).not.toMatch(/firebase/i);
    expect(fs.existsSync(path.join(repoRoot, 'public', 'lib', 'firebase'))).toBe(false);
  });

  it('allows no Firebase host in the Tauri CSP and keeps no old API setting', () => {
    const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
    const csp = JSON.stringify(conf.app.security.csp);
    expect(csp).not.toMatch(/firebase|firestore|googleapis|twilioquest-/i);
    expect(read('src/js/app/config/config.js')).not.toMatch(/apiBaseUrl/);
  });

  it('depends on no Firebase package and keeps no old publishing task or template', () => {
    const pkg = JSON.parse(read('package.json'));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(all).filter(name => /firebase/i.test(name))).toEqual([]);
    expect(pkg.scripts['check:firebase']).toBe('node tasks/check_firebase.js');
    expect(fs.existsSync(path.join(repoRoot, 'tasks', 'shared', 'firebase.js'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, '.env.template'))).toBe(false);
  });
});
