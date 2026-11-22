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
import { setValueAsync, deleteValueAsync } from '../../platform/store';
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

// Called with the keys of each committed update that is saved to disk (the
// cloud sync registers here; context must not import it, to avoid a cycle).
// Not called while persistence is suppressed.
let localChangeListener = null;

export function setLocalChangeListener(listener) {
  localChangeListener = listener;
}

/**
 * Replaces saved fields in the store, for restoring a cloud save: every key of
 * `values` is written, every key of `removedKeys` is deleted (so that the game
 * falls back to its default). They are applied one after another; a failure
 * stops at the first one. Persistence is suppressed first, after the saves
 * already queued finished, so that the running game cannot write its old state
 * over the result. It stays suppressed on success (the caller reloads the
 * window, which re-reads the store); on failure it is resumed and the error is
 * thrown. Reaching the end is the proof of success, not flushPendingSaves
 * (which resolves even when saves failed).
 * @param {Object<string, *>} values
 * @param {string[]} [removedKeys]
 */
export async function applySavedFields(values, removedKeys = []) {
  const savedFields = getSavedFields();
  const unknown = [...Object.keys(values), ...removedKeys].filter(
    key => !savedFields.includes(key)
  );
  if (unknown.length) {
    throw new Error(`Not saved fields: ${unknown.join(', ')}`);
  }
  suppressPersistence();
  try {
    await flushPendingSaves();
    for (const [key, value] of Object.entries(values)) {
      await setValueAsync(key, value);
    }
    for (const key of removedKeys) {
      await deleteValueAsync(key);
    }
  } catch (error) {
    resumePersistence();
    throw error;
  }
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
  contextRef.current.setState(validatedNewContext, () => afterCommit(validatedNewContext));
}

// Once a state change has been committed: emit events (one for all changes
// together and one each per individual key) and save the necessary fields to disk.
function afterCommit(validatedNewContext) {
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

  if (localChangeListener && !persistenceSuppressed) {
    localChangeListener(Object.keys(validatedNewContext).filter(key => getSavedFields().includes(key)));
  }
}

/**
 * Like setContext, but the update is computed from the latest state at the time
 * React commits it: `compute(state)` returns an object of key-value pairs to
 * merge (or null for no change). Several calls in one batch therefore build on
 * each other instead of overwriting one another, which a getContext + setContext
 * pair cannot guarantee (getContext reads the last committed state).
 * `compute` must not have side effects: React may call it more than once.
 */
export function updateContext(compute) {
  let validated = null;
  contextRef.current.setState(
    state => {
      validated = null;
      const update = compute(state);
      if (!update || Object.keys(update).length === 0) {
        return null;
      }
      const results = validateContextUpdate(update);
      if (!results.every(result => result.valid)) {
        console.warn('Skipping context update: context updates did not match schema.', update);
        return null;
      }
      validated = reduceEntries(results.map(({ key, update: value }) => [key, value]));
      return validated;
    },
    () => {
      if (validated) afterCommit(validated);
    }
  );
}

window.setContext = setContext;
