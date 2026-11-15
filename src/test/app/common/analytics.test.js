import analytics from '../../../js/app/common/analytics';

vi.mock('../../../js/app/platform/paths', () => ({
  getAppVersion: vi.fn(() => '9.9.9'),
}));

test('analytics API composition', async () => {
  expect(analytics.initializeAnalytics).toBeDefined();
});

// Universal Analytics was shut down in 2023 and the app never sent hits any
// more (pageview/event are no-ops), so only the identity data is kept.
describe('analytics without universal-analytics', () => {
  test('initializeAnalytics exposes the user guid and the app version', () => {
    analytics.initializeAnalytics({ user: { guid: 'user-guid' } });

    expect(analytics.analyticsId).toBe('user-guid');
    expect(analytics.appVersion).toBe('9.9.9');
    expect(analytics.visitor).toBeUndefined();
  });

  test('pageview and event stay callable for extensions and the UI', () => {
    expect(analytics.pageview('/path', 'Title')).toBeUndefined();
    expect(analytics.event('c', 'a', 'l', 1, 'title', '/path')).toBeUndefined();
  });
});
