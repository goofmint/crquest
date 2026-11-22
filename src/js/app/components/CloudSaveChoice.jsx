import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ButtonBar from './ButtonBar';
import { submitChoice } from '../common/cloudSave/choice';

function Summary({ heading, summary, updatedAt }) {
  const { t } = useTranslation();
  return (
    <div className="mb3">
      <h3 style={{ margin: '0 0 4px' }}>{heading}</h3>
      <div>{t('cloudSave.choice.summary', { xp: summary.xp, objectives: summary.objectives })}</div>
      {updatedAt && (
        <div>
          {t('cloudSave.choice.updatedAt', {
            date: new Date(updatedAt).toLocaleString(),
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Shown by the cloud sync when the signed-in account and this computer both
 * have a save. The answer goes to the sync engine through `submitChoice`; if
 * the sign-in changes meanwhile, the engine closes this overlay itself.
 */
export default function CloudSaveChoice({ local, cloud, hide, displayFsmState, finishTransition }) {
  const { t } = useTranslation();

  // The overlay's display machine waits for this: showing -> shown, hiding -> hidden.
  useEffect(() => {
    if ((displayFsmState === 'showing' || displayFsmState === 'hiding') && finishTransition) {
      finishTransition();
    }
  }, [displayFsmState, finishTransition]);
  const answers = ['cloud', 'local', 'cancel'];

  return (
    <div
      className="CloudSaveChoice"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-save-choice-title"
      style={{ maxWidth: '560px', padding: '24px', background: 'rgba(0, 0, 0, 0.85)' }}
    >
      <h2 id="cloud-save-choice-title">{t('cloudSave.choice.title')}</h2>
      <p>{t('cloudSave.choice.intro')}</p>
      <Summary heading={t('cloudSave.choice.localHeading')} summary={local} />
      <Summary
        heading={t('cloudSave.choice.cloudHeading')}
        summary={cloud}
        updatedAt={cloud.updatedAt}
      />
      <ButtonBar
        buttonLabels={[
          t('cloudSave.choice.useCloud'),
          t('cloudSave.choice.useLocal'),
          t('cloudSave.choice.cancel'),
        ]}
        onClick={index => {
          submitChoice(answers[index]);
          hide();
        }}
      />
    </div>
  );
}
