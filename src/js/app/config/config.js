import path from 'path';
import { isDev } from '../platform/env';
import bundledExtensionModules from './bundledExtensionModules.json';
import vendoredExtensionModules from './vendoredExtensionModules.json';
import { getAppDataPath, getUserDataPath } from '../platform/paths';

const appDataPath = path.resolve(getAppDataPath(), 'TerminalQuest');
const userDataPath = path.resolve(getUserDataPath());
const PRODUCTION_API_BASE_URL =
  'https://twilioquest-prod.firebaseapp.com/quest/';
const DEV_API_BASE_URL = 'https://twilioquest-dev.firebaseapp.com/quest/';
const saveFileName = 'config.json';

// Default configuration
let config = {
  defaultLevelName: 'fog_owl',
  defaultPlayerEntry: 'player_entry1',
  defaultMapName: 'default',
  prologueMissionStateKey: 'com.terminalquest.owls_nest',
  defaultLevelNamePrologue: 'owls_nest',
  defaultPlayerEntryPrologue: 'player_entry1',
  defaultMapNamePrologue: 'default',
  appDataPath,
  codeStoragePath: path.join(appDataPath, 'QuestIDE'),
  codeStorageFileName: 'user_code.js',
  apiBaseUrl: PRODUCTION_API_BASE_URL,
  bundledExtensionModules,
  vendoredExtensionModules,
  userDataPath,
  saveFileName,
  saveFilePath: path.join(userDataPath, saveFileName),
};

// Attempt to load local config in the dev environment, if present
if (isDev()) {
  try {
    const localConfig = require('./local_config');
    config = Object.assign(config, localConfig);
  } catch (e) {
    console.log('Error loading local config:');
    console.log(e);
  }

  if (config.apiBaseUrl === PRODUCTION_API_BASE_URL) {
    config.apiBaseUrl = DEV_API_BASE_URL;
  }
}

export default config;
