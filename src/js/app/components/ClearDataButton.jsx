import React from 'react';
import { withTranslation } from 'react-i18next';
import { removeAsync } from '../platform/fs';
import db from '../common/database';
import { hasValueAsync, deleteValueAsync } from '../platform/store';
import { showConfirm } from '../platform/dialog';
import Button from './Button';
import config from '../config/config';
import { describeSchema } from '../common/context/schema';
import { reportFailure } from '../common/reportFailure';
import {
  suppressPersistence,
  resumePersistence,
  flushPendingSaves,
} from '../common/context';

// Sequential, in schema order: the first failure stops the clearing.
async function clearStoreValues() {
  const schemaDescription = describeSchema();

  for (const [fieldKey, field] of Object.entries(schemaDescription.fields)) {
    if (await hasValueAsync(fieldKey)) {
      if (!field.meta || (field.meta && !field.meta.persistOnClearProgess)) {
        await deleteValueAsync(fieldKey);
      }
    }
  }
}

class ClearDataButton extends React.Component {
  async confirmClear() {
    // The async message box is not modal, so ignore repeated clicks while it is open
    if (this.confirming) {
      return false;
    }
    this.confirming = true;
    try {
      return (
        (await showConfirm(
          this.props.t('ui.clearData.first')
        )) &&
        (await showConfirm(
          this.props.t('ui.clearData.second')
        ))
      );
    } finally {
      this.confirming = false;
    }
  }

  // Only one erase at a time, from the first click until the reload: the flag
  // is released when the user cancels or the erase fails (so it can be retried),
  // and stays set after a successful erase (the window reloads).
  async clearUserData() {
    if (this.erasing) {
      return;
    }
    this.erasing = true;
    let retryable = true;
    try {
      retryable = !(await this.runErase());
    } finally {
      if (retryable) {
        this.erasing = false;
      }
    }
  }

  // Resolves true when the erase went through (reload pending), false when it
  // was cancelled. Throws when it failed.
  async runErase() {
    if (!(await this.confirmClear())) {
      console.log('aborting data clear...');
      return false;
    }

    // Upon confirmation, delete all user data and reload the window
    console.log('clearing data...');

    // Clear data stored on disk
    // From here until the reload, setContext must not write saved fields back
    // (see suppressPersistence). Saves already queued are finished first, so
    // they cannot land after the deletion. Persistence is resumed only when
    // clearing fails; on success the window reloads.
    suppressPersistence();
    try {
      await flushPendingSaves();
      await clearStoreValues();
      // Delete saved user code (a missing path is a no-op, as with the former
      // synchronous remove)
      await removeAsync(config.codeStoragePath);
    } catch (error) {
      resumePersistence();
      await reportFailure(this.props.t('ui.clearData.error'), error);
      throw error;
    }

    // Drop IndexedDB database and reload browser window
    db.delete()
      .then(() => {
        console.log('Database successfully deleted.');
      })
      .catch(err => {
        console.error('Could not delete database');
        console.error(err);
      })
      .finally(() => {
        window.location.reload();
      });

    return true;
  }

  render() {
    const { t } = this.props;
    const clearButtonStyles = {
      fontFamily: 'Monaco, "Source Code Pro", Consolas, monospace',
      height: '48px',
    };

    return (
      <Button
        label={t('ui.clearData.erase')}
        style={clearButtonStyles}
        className="fr bw3 f6 ma2"
        onClick={() => this.clearUserData()}
      />
    );
  }
}

export default withTranslation(undefined, { withRef: true })(ClearDataButton);
