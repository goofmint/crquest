// Test entry for the Tauri avatar bundle. It is evaluated in jsdom without
// Node globals to exercise the same PNG codec and asset URLs as the webview.
import { generateDataURI } from '../../js/app/common/avatarRenderer';

import { setPlatformState } from '../../js/app/platform/tauri/state';

window.avatarEntry = { generateDataURI, setPlatformState };
