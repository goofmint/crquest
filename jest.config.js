module.exports = {
  runner: '@jest-runner/electron',
  testEnvironment: '@jest-runner/electron/environment',
  transform: {
    "^.+\\.jsx?$": "babel-jest"
  },
  modulePaths: ['<rootDir>/public/node_modules'],
  // @testing-library/react (root devDependency) peer-installs its own React
  // under node_modules/. Pin React to the renderer's copy in public/node_modules
  // so that the app, styled-components and the test library share one instance.
  moduleNameMapper: {
    '^react$': '<rootDir>/public/node_modules/react',
    '^react/(.*)$': '<rootDir>/public/node_modules/react/$1',
    '^react-dom$': '<rootDir>/public/node_modules/react-dom',
    '^react-dom/(.*)$': '<rootDir>/public/node_modules/react-dom/$1'
  },
  setupFilesAfterEnv: [
    '<rootDir>/src/test/setup.js'
  ]
};
