/**
 * Operation membership for the settings screens and the onboarding. The server is
 * the authority; see ./groupMembership for the join / leave rules, including
 * what happens when signed out or offline.
 */
import { t } from '../i18n';
import { getContext } from './context';
import { OUTCOME, isJoined, joinByCode, leaveGroupEntry } from './groupMembership';

const KIND = 'operation';

function messageFor(outcome, name) {
  switch (outcome) {
    case OUTCOME.JOINED:
      return t('ui.membership.joined', { name });
    case OUTCOME.ALREADY_JOINED:
      return t('ui.operations.already');
    case OUTCOME.INVALID_CODE:
      return t('ui.operations.missing');
    case OUTCOME.LOGIN_REQUIRED:
      return t('ui.membership.loginRequired');
    default:
      return t('ui.membership.networkError');
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
  return isJoined(KIND, joinCode);
}

async function disconnectOperation(operation) {
  const result = await leaveGroupEntry(KIND, operation);
  if (result.outcome === OUTCOME.LEFT || result.outcome === OUTCOME.REMOVED_LOCALLY) {
    return { success: true };
  }
  return {
    success: false,
    message:
      result.outcome === OUTCOME.LOGIN_REQUIRED
        ? t('ui.membership.leaveLoginRequired')
        : t('ui.membership.leaveFailed'),
  };
}

async function joinOperation(code) {
  const joinCode = String(code ?? '').trim();
  if (joinCode === '') {
    return {
      success: false,
      message: t('ui.membership.codeRequired'),
    };
  }

  const result = await joinByCode(KIND, joinCode);
  const success = result.outcome === OUTCOME.JOINED;
  return { success, message: messageFor(result.outcome, result.displayName) };
}

export { getJoinedOperations, isOperationAlreadyJoined, disconnectOperation, joinOperation };
