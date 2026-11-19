import React, { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  getBundledExtensionDirectories,
  getExternalExtensionDirectories,
  areExtensionsEnabled,
  getExtensionDirectory,
} from '../../../common/extensions';
import Button from '../../Button';
import InlineButton from './InlineButton';
import InputTextField from './InputTextField';
import { showDirectoryDialog } from '../../../platform/dialog';

function ExtensionsList({ extensions }) {
  const { t } = useTranslation();
  return extensions.length > 0 ? (
    <ul>
      {extensions.map(({ name, absolutePath, isValid }) => (
        <li key={absolutePath}>
          {name} -{' '}
          <span
            style={{
              color: isValid ? '#00ff00' : '#ff0000',
            }}
          >
            {isValid ? t('ui.extensions.loaded') : t('ui.extensions.failed')}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <span>{t('ui.extensions.none')}</span>
  );
}

function AllExtensionsList() {
  const { t } = useTranslation();
  const [bundledExtensions, setBundledExtensions] = useState([]);
  const [externalExtensions, setExternalExtensions] = useState([]);

  const loadExtensions = async () => {
    const extensionQueries = [
      getBundledExtensionDirectories(),
      getExternalExtensionDirectories(),
    ];

    const [bundled, external] = await Promise.all(extensionQueries);

    setBundledExtensions(bundled);
    setExternalExtensions(external);
  };

  useEffect(() => {
    loadExtensions();
  }, []);

  return (
    <>
      <h4>{t('ui.extensions.external')}</h4>
      <p>{t('ui.extensions.externalInfo')}</p>
      <ExtensionsList extensions={externalExtensions} />
      <br />
      <h4>{t('ui.extensions.bundled')}</h4>
      <p>
        {t('ui.extensions.bundledInfo')}
      </p>
      <ExtensionsList extensions={bundledExtensions} />
    </>
  );
}

function EnabledExtensions({ onFocus, onBlur, save }) {
  const { t } = useTranslation();
  const directory = getExtensionDirectory();

  return (
    <>
      <p>
        <Trans i18nKey="ui.extensions.loadingNotice" components={{ emphasis: <span className="highlight" /> }} />
      </p>
      <br />
      <br />
      <Button
        onClick={() =>
          save(
            'extensions',
            {
              enabled: false,
            },
            'context'
          )
        }
      >
        {t('ui.extensions.disable')}
      </Button>
      <br />
      <br />
      <h4>{t('ui.extensions.directory')}</h4>
      <div>
        <InputTextField
          aria-label={t('ui.extensions.directory')}
          value={directory || t('ui.extensions.noDirectory')}
          disabled
        ></InputTextField>
        <InlineButton
          label={t('ui.extensions.chooseDirectory')}
          onClick={async () => {
            const directoryPath = await showDirectoryDialog({
              defaultPath: directory,
              buttonLabel: t('ui.extensions.choose'),
              title: t('ui.extensions.directoryTitle'),
            });

            if (!directoryPath) {
              return;
            }

            save(
              'extensions',
              {
                directory: directoryPath,
              },
              'context'
            );
          }}
        />
      </div>
      <br />
      <h3>{t('ui.extensions.all')}</h3>
      <AllExtensionsList />
      <br />
    </>
  );
}

function DisabledExtensions({ save }) {
  const { t } = useTranslation();
  return (
    <>
      <p>
        {t('ui.extensions.enableInfo')}
      </p>
      <p>
        <Trans i18nKey="ui.extensions.warning" components={{ emphasis: <span className="highlight" /> }} />
      </p>
      <Button
        onClick={() =>
          save(
            'extensions',
            {
              enabled: true,
            },
            'context'
          )
        }
      >
        {t('ui.extensions.enable')}
      </Button>
    </>
  );
}

export default function Extensions({ onFocus, onBlur, save }) {
  const { t } = useTranslation();
  const enabled = areExtensionsEnabled();

  return (
    <>
      <h3>{t('ui.extensions.title')}</h3>
      {enabled ? (
        <EnabledExtensions onFocus={onFocus} onBlur={onBlur} save={save} />
      ) : (
        <DisabledExtensions save={save} />
      )}
    </>
  );
}
