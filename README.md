# TerminalQuest

Answer the call of the cursor, and discover your power to change the world with code.

**TerminalQuest** is role-playing game where you - as an elite agent known as the Operator - embark on an adventure to explore and safeguard the virtual universe of The Cloud. To do so, you will need to master the tools of software development and beyond. Do you have what it takes to defeat the evil Legacy Systems and save The Cloud?

## Playing the game

The game is currently under active development, after a transition in ownership. End-user friendly builds of the game are coming soon!

## Local development

Developing TerminalQuest requires the following dependencies to be installed:

* [Node.js](https://nodejs.org/en) and [npm](https://www.npmjs.com/) - the build tooling targets Node 26 LTS (see `.nvmrc`). Use npm 11 or later, which ships with Node 26.

After cloning this repository, install dependencies with:

```
npm install
```

Fair warning - during this transitional period, this process may not happen without error. After dependencies are successfully installed, you can run the game in development mode with:

```
npm start
```

This will open a local [Electron](https://www.electronjs.org) window running the game.

### Tests

```
npm test
```

runs the unit tests with [Vitest](https://vitest.dev) (jsdom environment, [Testing Library](https://testing-library.com/docs/react-testing-library/intro/) for the React components). They run in plain Node.js and do not start Electron. The configuration is in `vitest.config.mjs`; see `docs/migration/vitest.md`.

## License

The source code for the game is available under an MIT license (see `LICENSE`).

The artwork, music, and other creative assets in this repository are available under a [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) (CC BY 4.0) license.
