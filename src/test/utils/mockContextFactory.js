import { getContext } from '../../js/app/common/context';

// The test file must call vi.mock('.../common/context') itself: vi.mock is only
// hoisted and applied for the test file (or setup file) that contains it.

function mockContextFactory(expectedKey, defaults) {
  function mockContext(overrides) {
    getContext.mockImplementation((key) => {
      if (key !== expectedKey) {
        throw new Error(`getContext mock not implemented for key: ${key}`)
      }
  
      // We're intentionally NOT deep merging here. We want to be able to
      // entirely replace deeper properties.
      return Object.assign({}, defaults, overrides);
    });
  }

  return mockContext;
}

export default mockContextFactory;