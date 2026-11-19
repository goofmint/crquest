import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/components/App';
import audioManager from './app/common/audio/index';
import { isDev } from './app/platform/env';
import { syncBundledAssets } from './app/common/assetLoader';
import extendYup from './app/common/extendYup';
import config from './app/config/config';
import { showAlert } from './app/platform/dialog';
import { openExternal, openPath } from './app/platform/shell';
import { toggleDevTools } from './app/platform/devtools';
import { addHelpMenuItems, getHelpMenuLabel } from './app/platform/menu';
import { onDocumentReady } from './app/common/documentReady';
import { t } from './app/i18n';

extendYup();

window.alert = function(message) {
  showAlert(message);
};

const DEVTOOLS_WARNING = `
*** DANGER ***

Danger! Wee-ooo, wee-ooo!

For real though - do NOT execute code given to you by strangers! Executing code in this window can harm your computer. Proceed with caution, or better yet, close this window unless you know precisely what you are doing.

*** DANGER ***
`;

setTimeout(() => console.warn(DEVTOOLS_WARNING), 1500);

function downloadJSON(blob, fileName = 'download') {
  let anchor = document.querySelector('#download-anchor');

  if (!anchor) {
    anchor = document.createElement('a');
    anchor.style.display = 'none';
    anchor.id = 'download-anchor';

    document.body.appendChild(anchor);
  }

  const dataStr =
    'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(blob));

  anchor.setAttribute('href', dataStr);
  anchor.setAttribute('download', `${fileName}.json`);
  anchor.click();
}

// Capture link clicks to web resources and open in system default browser
document.addEventListener(
  'click',
  e => {
    if (e.target.matches('a[href^="http"]')) {
      e.preventDefault();
      const targetUrl = new URL(e.target.href);
      const newQuery = new URLSearchParams(targetUrl.searchParams.toString());
      const newUrl = [
        targetUrl.origin,
        targetUrl.pathname,
        `?${newQuery.toString()}`,
        targetUrl.hash,
      ].join('');
      console.log('Opening external link:', newUrl);
      openExternal(newUrl);
    }
  },
  false
);

// Load Spector.js debugger
let spector;
if (isDev()) {
  const script = document.createElement('script');
  script.onload = () => {
    spector = new window.SPECTOR.Spector();
    spector.onCaptureStarted.add(() => {});
    spector.onCapture.add(result => {
      downloadJSON(result, 'spector-capture');
    });
    spector.onError.add(console.error);
  };
  script.src = 'https://spectorcdn.babylonjs.com/spector.bundle.js';
  document.head.appendChild(script);
}

// Add Menu Items once game launches
const helpMenuItems = [
  {
    id: 'help-toggle-devtools',
    label: getHelpMenuLabel('help-toggle-devtools'),
    click: () => {
      console.warn(DEVTOOLS_WARNING);
      toggleDevTools();
    },
  },
  {
    id: 'help-sync-assets',
    label: getHelpMenuLabel('help-sync-assets'),
    click: async () => {
      console.log('Syncing bundled assets...');
      await syncBundledAssets();
      console.log('Bundled assets synced!');
    },
  },
  {
    id: 'help-open-user-data',
    label: getHelpMenuLabel('help-open-user-data'),
    click: () => {
      openPath(config.userDataPath);
    },
  },
  {
    id: 'help-open-save-file',
    label: getHelpMenuLabel('help-open-save-file'),
    click: () => {
      openPath(config.saveFilePath);
    },
  },
];

if (isDev()) {
  helpMenuItems.push(
    {
      id: 'help-show-spector',
      label: t('shell.menu.showSpector'),
      click: () => {
        spector.displayUI();
      },
    },
    {
      id: 'help-capture-with-spector',
      label: t('shell.menu.captureWithSpector'),
      click: () => {
        console.log('Spector.js capture starting...');
        spector.startCapture(document.querySelector('canvas'));
      },
    }
  );
}

addHelpMenuItems(helpMenuItems);

const appDependencies = {
  dom: {
    loaded: false,
  },
  audio: {
    loaded: false,
  },
};

function areDependenciesLoaded() {
  return Object.values(appDependencies).every(dependency => dependency.loaded);
}

function attemptAppRender() {
  if (areDependenciesLoaded()) {
    // Mount React app on named DOM element
    const appNode = document.getElementById('app');

    createRoot(appNode).render(<App />);
  }
}

onDocumentReady(document, () => {
  appDependencies.dom.loaded = true;

  attemptAppRender();
});

audioManager.onload = () => {
  appDependencies.audio.loaded = true;

  attemptAppRender();
};
// Rejections (e.g. a missing audio directory) surface as unhandled promise
// rejections; the app is not rendered, as before.
Promise.all([audioManager.loadMusic(), audioManager.loadSfx()]);
