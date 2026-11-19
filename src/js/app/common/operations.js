import config from '../config/config';
import { t } from '../i18n';
import {
  getContext,
  setContext
} from './context';


async function getOperationFromBackend(joinCode) {
  try {
    const response = await fetch(config.apiBaseUrl + `api/v1/operations/joinCode/${joinCode}`);

    if (response.status === 404) {
      return {
        success: false,
        message: t('ui.operations.missing'),
      };
    }

    const operation = await response.json();

    if (operation.errors) {
      console.error(operation.errors);
      
      return {
        success: false,
        message: t('ui.membership.requestError'),
      };
    }

    return {
      success: true,
      operation
    };
  } catch (err) {
    console.error(err);
    
    return {
      success: false,
      message: t('ui.membership.requestError'),
    };
  }
}

function getJoinedOperations() {
  const operations = getContext('operations');

  if (operations.joined.length === 0) {
    return false;
  }

  return operations.joined;
}

function isOperationAlreadyJoined(joinCode) {
  const operations = getContext('operations');

  return operations.joined.some(operation => operation.joinCode === joinCode);
}

function connectOperation(operation) {
  const operations = getContext('operations');

  const newOperation = {
    id: operation.id,
    joinCode: operation.data.joinCode,
    displayName: operation.data.displayName
  }

  setContext({
    operations: {
      ...operations,
      joined: [
        ...operations.joined,
        newOperation
      ]
    }
  });
}

function disconnectOperation(operation) {
  const operations = getContext('operations');

  // Filter out operation being disconnected
  const joined = operations.joined.filter(joinedOperation => joinedOperation.id !== operation.id);

  setContext({
    operations: {
      ...operations,
      joined
    }
  })
}

function joinOperation(id) {
  return new Promise(async resolve => {
    if (id === '') {
      return resolve({
        success: false,
        message: t('ui.membership.codeRequired'),
      });
    }

    if (isOperationAlreadyJoined(id)) {
      return resolve({
        success: false,
        message: t('ui.operations.already'),
      });
    }

    const operationResult = await getOperationFromBackend(id);

    if (!operationResult.success) {
      return resolve({
        success: operationResult.success,
        message: operationResult.message
      });
    }

    const { operation } = operationResult;

    connectOperation(operation);

    return resolve({
      success: true,
      message: t('ui.membership.joined', { name: operation.data.displayName }),
    });
  });
}


export {
  getJoinedOperations,
  isOperationAlreadyJoined,
  connectOperation,
  disconnectOperation,
  joinOperation
}