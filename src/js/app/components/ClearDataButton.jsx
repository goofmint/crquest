import React from 'react';
import { remove } from '../platform/fs';
import db from '../common/database';
import { hasValueAsync, deleteValueAsync } from '../platform/store';
import { showConfirm } from '../platform/dialog';
import Button from './Button';
import config from '../config/config';
import { describeSchema } from '../common/context/schema';
import { reportFailure } from '../common/reportFailure';

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

export default class ClearDataButton extends React.Component {
  async confirmClear() {
    // The async message box is not modal, so ignore repeated clicks while it is open
    if (this.confirming) {
      return false;
    }
    this.confirming = true;
    try {
      return (
        (await showConfirm(
          `All user data and progress will be deleted. Continue?`
        )) &&
        (await showConfirm(
          `Seriously, we are about to delete all your items and re-set all your progress in the game. Are you very sure you want to do this?`
        ))
      );
    } finally {
      this.confirming = false;
    }
  }

  async clearUserData() {
    if (!(await this.confirmClear())) {
      console.log('aborting data clear...');
      return;
    }

    // Upon confirmation, delete all user data and reload the window
    console.log('clearing data...');

    // Clear data stored on disk
    try {
      await clearStoreValues();
    } catch (error) {
      await reportFailure('Could not clear the saved game data', error);
      throw error;
    }

    // Delete saved user code
    remove(config.codeStoragePath);

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
  }

  render() {
    const clearButtonStyles = {
      fontFamily: 'Monaco, "Source Code Pro", Consolas, monospace',
      height: '48px',
    };

    return (
      <Button
        label="Erase Game Data"
        style={clearButtonStyles}
        className="fr bw3 f6 ma2"
        onClick={() => this.clearUserData()}
      />
    );
  }
}
