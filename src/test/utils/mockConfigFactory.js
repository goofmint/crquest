import config from '../../js/app/config/config';

// The test file must call vi.mock('.../config/config') itself: vi.mock is only
// hoisted and applied for the test file (or setup file) that contains it.

function mockConfigFactory(defaults) {
  function mockConfig(overrides) {
    // We're intentionally NOT deep merging here. We want to be able to
    // entirely replace deeper properties.
    const mockedProps = Object.assign({}, defaults, overrides);

    Object.entries(mockedProps).forEach(([key, value]) => {
      Object.defineProperty(
        config,
        key,
        { get: () => value }
      );
    })
  }

  return mockConfig;
}

export default mockConfigFactory;