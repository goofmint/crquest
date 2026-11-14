import React from 'react';
import { remove } from '../platform/fs';
import db from '../common/database';
import { hasValue, deleteValue } from '../platform/store';
import { showConfirm } from '../platform/dialog';
import Button from './Button';
import config from '../config/config';
import { describeSchema } from '../common/context/schema';

function clearStoreValues() {
  const schemaDescription = describeSchema();

  Object.entries(schemaDescription.fields).forEach(([fieldKey, field]) => {
    if (hasValue(fieldKey)) {
      if (!field.meta || (field.meta && !field.meta.persistOnClearProgess)) {
        deleteValue(fieldKey);
      }
    }
  })
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
    clearStoreValues();

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
