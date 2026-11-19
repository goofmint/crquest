import React, { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useAudioManager } from '../../../common/audio/index';

function VolumeControl({ title, audioType }) {
  const { t } = useTranslation();
  const { audioState, audioManager, syncAudioState } = useAudioManager();
  const { muted, volume } = audioState[audioType];
  let icon;

  if (muted) {
    icon = 'mute';
  } else if (audioType === 'master') {
    icon = '3'
  } else if (volume < .1) {
    icon = '0'
  } else if (volume < .3) {
    icon = '1';
  } else if (volume < .5) {
    icon = '2';
  } else if (volume < .7) {
    icon = '3'
  } else if (volume < .9) {
    icon = '4';
  } else {
    icon = '5';
  }

  return (
    <tr className="audio-table" key="title">
      <th>
        {title}
      </th>
      <td>
        <img
          className="h1"
          src={`images/app/audio/speaker_${icon}.png`}
          alt={muted ? t('ui.audio.speakerMuted') : t('ui.audio.speakerOn')}
        />
      </td>
      <td>
        {audioType !== 'master' && (
          <input
            onDoubleClick={() => {
              audioManager[audioType].setVolumeAll(.5);
              syncAudioState();
            }}
            disabled={muted}
            className={`pointer ${muted ? 'o-50' : ''}`}
            aria-label={title}
            type="range"
            min={1}
            max={100}
            value={audioState[audioType].volume * 100}
            onChange={({ target }) => {
              audioManager[audioType].setVolumeAll(target.value / 100);
              syncAudioState();
            }}
          />
        )}
        <span
          style={{
            display: 'inline-block',
            padding:'5px',
            border: '1px solid',
            color: muted ? '#787878' : '#eeeeee',
          }}
          className="pointer"
          onClick={() => {
            if (muted) {
              audioManager[audioType].unMute();
            } else {
              audioManager[audioType].mute();
            }

            // Sync settings display state with audio manager's state
            syncAudioState();
          }}
        >
          {muted ? t('ui.audio.unmute') : t('ui.audio.mute')}
        </span>
      </td>
    </tr>
  );
}

export default function AudioTab() {
  const { t } = useTranslation();
  return (
    <Fragment>
      <h3>{t('ui.audio.title')}</h3>
      <table>
        <tbody>
          <VolumeControl title={t('ui.audio.master')} audioType="master" />
          <VolumeControl title={t('ui.audio.music')} audioType="music" />
          <VolumeControl title={t('ui.audio.voice')} audioType="vo" />
          <VolumeControl title={t('ui.audio.sfx')} audioType="sfx" />
        </tbody>
      </table>
    </Fragment>
  );
}
