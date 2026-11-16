# TerminalQuest

Answer the call of the cursor, and discover your power to change the world with code.

**TerminalQuest** is role-playing game where you - as an elite agent known as the Operator - embark on an adventure to explore and safeguard the virtual universe of The Cloud. To do so, you will need to master the tools of software development and beyond. Do you have what it takes to defeat the evil Legacy Systems and save The Cloud?

## Playing the game

The game is currently under active development, after a transition in ownership. End-user friendly builds of the game are coming soon!

## Local development

This section is the current development workflow. The files under `docs/migration/` are records of how the Electron to Tauri migration was done; each one describes the repository at the time it was written, so rely on this README for the current commands.

TerminalQuest runs on two shells that share one codebase: [Electron](https://www.electronjs.org) (the default, used by `npm start`) and [Tauri 2](https://tauri.app) (under development, used by `npm run tauri`).

### Prerequisites

- [Node.js](https://nodejs.org/en) and [npm](https://www.npmjs.com/) - the build tooling targets Node 26 LTS (see `.nvmrc`). Use npm 11 or later, which ships with Node 26.
- For the Tauri shell only: [Rust](https://www.rust-lang.org/tools/install) 1.90 or later (`rust-version` in `src-tauri/Cargo.toml`) and the operating system packages listed in the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for macOS, Windows or Linux. They are not needed for the Electron shell, the build or the tests.

### Install

After cloning this repository, install dependencies with:

```
npm install
```

(`npm ci` also works.) Fair warning - during this transitional period, this process may not happen without error.

Installing in the repository root also runs `postinstall`, which runs `npm install` in `public/` (the renderer's runtime dependencies live in `public/node_modules`). `public/package-lock.json` is intentionally still `lockfileVersion` 1, so do not regenerate it as a side effect of unrelated work. The root `devDependencies` also pin `npm` 6, so `node_modules/.bin/npm` is npm 6 while the `npm` you run is the one that ships with your Node.

### Run with Electron

```
npm start
```

This runs `build:all`, then starts the [Electron](https://www.electronjs.org) window (`launch`) together with the JS and CSS watchers (`watch:all`).

### Run with Tauri

```
npm run tauri -- dev
```

This runs `npm run build:tauri` first (`beforeDevCommand` in `src-tauri/tauri.conf.json`) and then opens the Tauri window. To build a debug bundle instead, use `npm run tauri -- build --debug`; `beforeBuildCommand` runs `npm run build:tauri` here too.

Things to know:

- `build:tauri` and `build:all` both write `public/index.js` (and `public/index.html`, `public/index.css`), so the output is shared. After running Tauri, run `npm run build:all` before going back to Electron (`npm start` does this itself).
- Save data is not shared. Electron keeps it in `userData/config.json`; Tauri keeps it in a separate `config.json` under the app data directory (`$APPDATA/com.terminalquest.desktop`). Progress is not migrated between the two.
- The Tauri window has a Content Security Policy (`app.security.csp` in `src-tauri/tauri.conf.json`). Violations only show in the webview console (F12 in a debug build). How to revert it is described in `docs/migration/tauri-runtime.md`.

### Tests

```
npm test
```

runs the unit tests with [Vitest](https://vitest.dev) (jsdom environment, [Testing Library](https://testing-library.com/docs/react-testing-library/intro/) for the React components). They run in plain Node.js and do not start Electron or Tauri. The configuration is in `vitest.config.mjs`; see `docs/migration/vitest.md`. There is no `lint` script.

The Rust side has its own checks, run from `src-tauri/` (`cargo fmt --check`, `cargo clippy`, `cargo test`).

### Verifying the Tauri build by hand

The automated tests cannot start the Tauri window, so changes that touch the Tauri build need a manual check: run `npm run tauri -- dev` and confirm that the title screen appears, a new game starts, the keys move the player, the Help menu works, the avatar is shown, a conversation plays, and the DevTools console shows no Content Security Policy violations. The step-by-step checklists are in `docs/migration/tauri-runtime.md` (section 6 for the milestones, and the W12 manual checks for the CSP and the distribution build); follow them instead of copying them here.

## License

The source code for the game is available under an MIT license (see `LICENSE`).

The artwork, music, and other creative assets in this repository are available under a [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) (CC BY 4.0) license.
