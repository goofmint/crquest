import { getAppVersion } from '../platform/paths';

// No analytics service is called: Universal Analytics was shut down in 2023
// and the hit-sending code was already disabled. pageview/event are kept as
// no-ops because the UI and bundled content call them (see
// docs/migration/analytics-firebase.md).

// Session tracking singleton
let sessionTrackingStarted = false;

// Functionality to be exposed to module consumers
const analytics = {
  initializeAnalytics,
  appVersion: undefined,
  analyticsId: undefined,
  pageview,
  event,
};

function initializeAnalytics(state) {
  const {
    user: {
      guid
    }
  } = state;

  // Get app version - will be electron version in dev, actual app version in prod
  analytics.appVersion = getAppVersion();
  analytics.analyticsId = guid;
}

// Helper function to track a "page view" event - this allows us to cheat a bit
// And use Google Analytics' website-oriented dashboards/features
function pageview(path, title, options = {}) {
  const hit = {
    dt: title,
    dp: path,
  };

  // Determine if this is the first page view event since module load - if so,
  // begin session tracking
  if (!sessionTrackingStarted) {
    hit.sc = 'start';
    sessionTrackingStarted = true;
  }

  // Mix in any custom session parameters
  // analytics.visitor.pageview(Object.assign(hit, options)).send();
}

// Helper function to send an event
function event(category, action, label, value, pageTitle, pagePath) {
  /* analytics.visitor
    .event({
      ec: category,
      ea: action,
      el: label,
      ev: value,
      dt: pageTitle,
      dp: pagePath,
    })
    .send(); */
}

export default analytics;