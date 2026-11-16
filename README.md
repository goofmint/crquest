# TerminalQuest

Answer the call of the cursor, and discover your power to change the world with code.

**TerminalQuest** is role-playing game where you - as an elite agent known as the Operator - embark on an adventure to explore and safeguard the virtual universe of The Cloud. To do so, you will need to master the tools of software development and beyond. Do you have what it takes to defeat the evil Legacy Systems and save The Cloud?

## Playing the game

The game is currently under active development, after a transition in ownership. End-user friendly builds of the game are coming soon!

## Local development

This section is the current development workflow. The files under `docs/migration/` are records of how the Electron to Tauri migration was done; each one describes the repository at the time it was written, so rely on this README for the current commands.

TerminalQuest is a [Tauri 2](https://tauri.app) desktop app. The former [Electron](https://www.electronjs.org) shell was removed (#65); `docs/migration/tauri-runtime.md` records the decision.

### Prerequisites

- [Node.js](https://nodejs.org/en) and [npm](https://www.npmjs.com/) - the build tooling targets Node 26 LTS (see `.nvmrc`). Use npm 11 or later, which ships with Node 26.
- To run or bundle the app: [Rust](https://www.rust-lang.org/tools/install) 1.90 or later (`rust-version` in `src-tauri/Cargo.toml`) and the operating system packages listed in the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for macOS, Windows or Linux. They are not needed for the frontend build (`npm run build:tauri`) or the tests.

### Install

After cloning this repository, install dependencies with:

```
npm install
```

(`npm ci` also works.) Fair warning - during this transitional period, this process may not happen without error.

Installing in the repository root also runs `postinstall`, which runs `npm install` in `public/` (the renderer's runtime dependencies live in `public/node_modules`). `public/package-lock.json` is intentionally still `lockfileVersion` 1, so do not regenerate it as a side effect of unrelated work. The root `devDependencies` also pin `npm` 6, so `node_modules/.bin/npm` is npm 6 while the `npm` you run is the one that ships with your Node.

### Run the app

```
npm start
```

`npm start` is `tauri dev` (`npm run tauri -- dev` does the same). It runs `npm run build:tauri` first (`beforeDevCommand` in `src-tauri/tauri.conf.json`) and then opens the Tauri window. To build a debug bundle instead, use `npm run tauri -- build --debug`; `beforeBuildCommand` runs `npm run build:tauri` here too.

Things to know:

- `npm run build` is `npm run build:tauri`: it writes `public/index.js`, `public/tauri-game.js`, `public/index.html` and `public/index.css`, and stages `tauri-dist/` (the `frontendDist`).
- Progress saved by the former Electron app is not migrated. Both apps use a file named `config.json`; the default locations were:

  | App                                                            | macOS                                                                 | Windows                                           | Linux                                                                                                             |
  | :------------------------------------------------------------- | :-------------------------------------------------------------------- | :------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------- |
  | Former Electron app (`userData`, app name `terminalquest`)     | `~/Library/Application Support/terminalquest/config.json`             | `%APPDATA%\terminalquest\config.json`             | `$XDG_CONFIG_HOME/terminalquest/config.json`, or `~/.config/terminalquest/config.json`                            |
  | Tauri (`app_data_dir`, identifier `com.terminalquest.desktop`) | `~/Library/Application Support/com.terminalquest.desktop/config.json` | `%APPDATA%\com.terminalquest.desktop\config.json` | `$XDG_DATA_HOME/com.terminalquest.desktop/config.json`, or `~/.local/share/com.terminalquest.desktop/config.json` |

  The directories come from the official [Electron](https://www.electronjs.org/docs/latest/api/app#appgetpathname) and [Tauri](https://docs.rs/tauri/2/tauri/path/struct.PathResolver.html) documentation. The Windows `%APPDATA%` path is the Roaming AppData folder. The `config.json` file name is taken from the code (`src/js/app/config/config.js`, `src/js/app/platform/tauri/store.js`); the paths have not been checked on a running build.

- The Tauri window has a Content Security Policy (`app.security.csp` in `src-tauri/tauri.conf.json`). Violations only show in the webview console (F12 in a debug build). How to revert it is described in `docs/migration/tauri-runtime.md`.

### Build a release bundle with Tauri

```
npm run release
```

`release` is `tauri build` (`npm run tauri -- build` does the same). `beforeBuildCommand` runs `npm run build:tauri` first, so there is no separate build step. It needs the Rust toolchain and the operating system packages listed under Prerequisites, and it builds the bundle formats of the operating system you run it on (`bundle.targets` is `all` in `src-tauri/tauri.conf.json`). The artifacts are written under `src-tauri/target/release/bundle/` (for example `macos/` and `dmg/` on macOS, `nsis/` and `msi/` on Windows, `deb/`, `rpm/` and `appimage/` on Linux), and the executable is `src-tauri/target/release/`. The version comes from `public/package.json`.

Code signing, notarization and publishing are not automated: nothing is uploaded anywhere. The old `release` script (`tasks/create_release.js`) tarred `public/` and published it to Firebase Storage and Firestore for the Electron build; it was removed together with its dependencies (see `docs/migration/tasks-dependencies.md`). `npm run ci` runs `install:app` and `release`.

### Scripts under `tasks/`

The scripts in `tasks/` are CommonJS and run on Node 26. `npm run sync:missions` needs the Firebase variables in `.env.template`; `npm run generateVoiceOvers` needs AWS credentials that the default AWS provider chain can find (Amazon Polly, region `us-east-1`).

### Tests

```
npm test
```

runs the unit tests with [Vitest](https://vitest.dev) (jsdom environment, [Testing Library](https://testing-library.com/docs/react-testing-library/intro/) for the React components). They run in plain Node.js and do not start Tauri. The configuration is in `vitest.config.mjs`; see `docs/migration/vitest.md`. The platform modules that read files and run commands (`platform/fs`, `exec`, `env`, `assets`, `paths`, `conversationTemplate`) are replaced there by the Node-backed ones in `src/test/nodePlatform/`, because the Tauri implementation needs a webview; `platform/tauri/*` has its own tests. There is no `lint` script: the static checks are `npm run check:platform` (below) and, on the Rust side, `cargo fmt --check` and `cargo clippy`.

The Rust side has its own checks, run from `src-tauri/` (`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`).

`npm run check:platform` (`tasks/check_platform_boundary.js`) fails when code under `src/js` (outside `src/js/app/platform`) loads `electron`, `electron-is-dev`, `fs-jetpack` or `fs` through module-loading syntax (`import`, `export ... from`, `require()`, dynamic `import()`); candidate files are found with `git grep` and then parsed with `@babel/parser`, so a file that cannot be parsed is an error. Comments and plain strings such as a mock key `'fs': ...` are not violations. It exits 0 when there are none. See `docs/migration/final-verification.md` for the full verification record.

### Verifying the Tauri build by hand

The automated tests cannot start the Tauri window, so changes that touch the Tauri build need a manual check: run `npm start` and confirm that the title screen appears, a new game starts, the keys move the player, the Help menu works, the avatar is shown, a conversation plays, and the DevTools console shows no Content Security Policy violations. The step-by-step checklists are in `docs/migration/tauri-runtime.md` (section 6 for the milestones, and the W12 manual checks for the CSP and the distribution build); follow them instead of copying them here.

## License

The source code for the game is available under an MIT license (see `LICENSE`).

The artwork, music, and other creative assets in this repository are available under a [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) (CC BY 4.0) license.
