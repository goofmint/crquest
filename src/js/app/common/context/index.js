import React from 'react';
import EventEmitter from 'events';
import {
  stripIndents
} from 'common-tags';
import {
  validateContextUpdate,
  reduceEntries,
  describeSchema
} from './schema';
import {
  syncContext
} from './sync';
import { setValueAsync } from '../../platform/store';
import { reportFailure } from '../reportFailure';
import { t } from '../../i18n';

// Saves triggered by setContext are applied one after another, in call order
// (an asynchronous store may otherwise apply a later value first). A failed
// save does not block the later ones; its caller still gets the error.
let saveChain = Promise.resolve();
let persistenceSuppressed = false;
let pendingLanguage;

function enqueueSave(write) {
  const save = saveChain.then(write);
  saveChain = save.catch(() => {});
  return save;
}

/**
 * Resolves when every save queued so far has finished (successfully or not).
 */
export function flushPendingSaves() {
  return saveChain;
}

// Language takes effect on the next boot. Persist it in the same queue as
// other settings without publishing a language change in the current session.
export function saveLanguagePreference(language) {
  return enqueueSave(async () => {
    if (persistenceSuppressed) {
      throw new Error('Game data is being erased');
    }
    await setValueAsync('settings', { ...getContext('settings'), language });
    pendingLanguage = language;
  });
}

/**
 * While suppressed, setContext skips persisting saved fields (explicitly, and
 * logged with console.warn). The in-memory context, the events and
 * syncContext are unchanged. Used while the game data is being erased, so
 * that deleted keys are not written again before the reload.
 */
export function suppressPersistence() {
  persistenceSuppressed = true;
}

export function resumePersistence() {
  persistenceSuppressed = false;
}

export const context = React.createContext({});
export const emitter = new EventEmitter();
let contextRef;

export function getSavedFields() {
  const schemaDescription = describeSchema();

  return Object.entries(schemaDescription.fields)
    .filter(([, field]) => field.meta && field.meta.saveToDisk)
    .map(([fieldKey]) => fieldKey);
}

// Used only once during application startup, to store a reference to the
// specific instance of the Context component being used.
export function setContextRef(ref) {
  contextRef = ref;
}

export function getContext(key) {
  if (!key) {
    return contextRef.current.state;
  }

  return contextRef.current.state[key];
}

// Takes an object of key-value pairs to be merged into context (like setState)
export function setContext(newContext) {
  const validationResults = validateContextUpdate(newContext);

  const isValidUpdate = validationResults.every(result => result.valid);

  if (!isValidUpdate) {
    console.warn(
      stripIndents `
      Skipping context update: context updates did not match schema. See earlier errors for more information.
      
      Attempted context update:
      `,
      newContext
    );
    return;
  }

  // Recombine the validation results into a React formatted
  // state update slice.
  const validatedNewContext = reduceEntries(
    validationResults.map(({
      key,
      update
    }) => [key, update])
  );

  // Merge new properties into the state of the Context component
  contextRef.current.setState(validatedNewContext, () => {
    // Once state change has been committed, emit events: one for all changes
    // together and one each per individual key. Also, save any necessary
    // fields to disk.
    emitter.emit('contextUpdate', validatedNewContext);
    Object.entries(validatedNewContext).forEach(([key, value]) => {
      emitter.emit(`contextUpdate:${key}`, value);
      if (getSavedFields().includes(key)) {
        if (persistenceSuppressed) {
          console.warn(`Not saving "${key}": the game data is being erased`);
        } else {
          // Not awaited: the event order of the loop stays as before.
          enqueueSave(() => setValueAsync(
            key,
            key === 'settings' && pendingLanguage
              ? { ...value, language: pendingLanguage }
              : value
          )).catch(error =>
            reportFailure(t('errors.saveField', { key }), error)
          );
        }
      }
    });

    syncContext(validatedNewContext);
  });

}

window.setContext = setContext;
