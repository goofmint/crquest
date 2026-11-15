import { useState } from 'react';
import path from 'path';
import { listAsync } from '../../platform/fs';
import { getValueAsync, setValueAsync } from '../../platform/store';
import { reportFailure } from '../reportFailure';
import { staticFilePath } from '../fs_utils';
import { toAssetUrl, toAssetSrc } from '../../platform/assets';
import TrackPlayer from './TrackPlayer';
import { readDirectory, resolveAbsolutePath } from '../assetLoader';
import levelLoader from '../levelLoader';

const SUPPORTED_FILE_EXTENSIONS = ['.mp3', '.ogg', '.wav'];

const DEFAULT_AUDIO_STATE = {
  master: {
    muted: false,
  },
  vo: {
    volume: 0.6,
    muted: false,
  },
  music: {
    volume: 0.15,
    muted: false,
  },
  sfx: {
    volume: 0.5,
    muted: false,
  },
};

class VoiceOverPlayer extends TrackPlayer {
  play(trackName) {
    // Do not play multiple voice overs at the same time, stop all previously playing ones
    super.stopAll();
    super.play(trackName);
  }
}

class MusicPlayer extends TrackPlayer {
  play(trackName) {
    // Do not play multiple tracks at the same time, fade the previously playing into this one
    if (this.currentlyPlayingTracks.length > 0) {
      // There should only ever be one musical track playing at the same time
      super.fadeOutAll();
    }
    super.fadeIn(trackName);
  }

  stopAll() {
    super.fadeOutAll();
  }
}

class AudioManager {
  muted = false;
  loaded = false;

  constructor() {
    this.vo = new VoiceOverPlayer(this);

    this.sfx = new TrackPlayer(this);
    this.sfx.onload = () => this.checkLoaded('sfx');

    this.music = new MusicPlayer(this);
    this.music.onload = () => this.checkLoaded('music');

    // Expose master audio channel controls on this namespace to
    // make them analgous to the other channels.
    this.master = {
      unMute: this.unMute.bind(this),
      mute: this.mute.bind(this),
    };
  }

  areAllPlayersLoaded() {
    // We do not need to track onload for vo, because it is loaded per level right now

    return this.sfx.loaded && this.music.loaded;
  }

  async checkLoaded(key) {
    if (this.areAllPlayersLoaded()) {
      this.loaded = true;

      // onload is called only after the saved state has been applied; when the
      // saved state cannot be read, the failure is reported and onload is not
      // called (no default state is substituted).
      try {
        await this.loadState();
      } catch (error) {
        await reportFailure('Could not load the saved audio settings', error);
        return;
      }

      this.onload();
    }
  }

  onload() {
    // Override AudioManager.onload for custom on load behavior, after all files have been loaded
  }

  mute() {
    this.muted = true;

    this.vo.upateTracksMuteStatus();
    this.sfx.upateTracksMuteStatus();
    this.music.upateTracksMuteStatus();
  }

  unMute() {
    this.muted = false;

    this.vo.upateTracksMuteStatus();
    this.sfx.upateTracksMuteStatus();
    this.music.upateTracksMuteStatus();
  }

  async loadState() {
    let audioState = await getValueAsync('audio');

    if (!audioState) {
      audioState = DEFAULT_AUDIO_STATE;
    }

    Object.entries(audioState).forEach(([channel, channelState]) => {
      if (channelState.muted) {
        this[channel].mute();
      } else {
        this[channel].unMute();
      }

      if (channel !== 'master') {
        this[channel].setVolumeAll(channelState.volume);
      }
    });
  }

  async saveState() {
    try {
      await setValueAsync('audio', this.getState());
    } catch (error) {
      await reportFailure('Could not save the audio settings', error);
    }
  }

  getState() {
    return {
      master: {
        muted: this.muted,
        volume: this.volume,
      },
      vo: {
        muted: this.vo.muted,
        volume: this.vo.volume,
      },
      music: {
        muted: this.music.muted,
        volume: this.music.volume,
      },
      sfx: {
        muted: this.sfx.muted,
        volume: this.sfx.volume,
      },
    };
  }

  /**
   * Lists the directory, registers every supported file and calls load() on the
   * player. Resolves once load() has been called (not when the Howl files have
   * finished loading); rejects if the directory cannot be listed.
   */
  async loadSfx() {
    const sfxDirPath = staticFilePath(`levels/common/sfx`);
    const sfxFileUrls = {};
    const fileNames = await listAsync(sfxDirPath);
    if (fileNames === undefined) {
      throw new Error(`Audio directory does not exist: ${sfxDirPath}`);
    }
    fileNames.forEach(fileName => {
      const fileExtension = path.extname(fileName);
      if (SUPPORTED_FILE_EXTENSIONS.includes(fileExtension)) {
        const baseName = path.basename(fileName, fileExtension);
        const fileUrl = toAssetUrl(staticFilePath(`levels/common/sfx/${fileName}`));

        sfxFileUrls[baseName] = sfxFileUrls[baseName]
          ? [...sfxFileUrls[baseName], fileUrl]
          : [fileUrl];
      }
    });

    Object.entries(sfxFileUrls).map(([key, fileUrls]) => {
      this.sfx.register(key, fileUrls);
    });

    this.sfx.load();
  }

  /**
   * Lists the directory, registers every supported file and calls load() on the
   * player. Resolves once load() has been called (not when the Howl files have
   * finished loading); rejects if the directory cannot be listed.
   */
  async loadMusic() {
    const musicDirPath = staticFilePath(`levels/common/music`);
    const musicFileUrls = {};
    const fileNames = await listAsync(musicDirPath);
    if (fileNames === undefined) {
      throw new Error(`Audio directory does not exist: ${musicDirPath}`);
    }
    fileNames.forEach(fileName => {
      const fileExtension = path.extname(fileName);
      if (SUPPORTED_FILE_EXTENSIONS.includes(fileExtension)) {
        const baseName = path.basename(fileName, fileExtension);
        const fileUrl = toAssetUrl(staticFilePath(`levels/common/music/${fileName}`));

        musicFileUrls[baseName] = musicFileUrls[baseName]
          ? [...musicFileUrls[baseName], fileUrl]
          : [fileUrl];
      }
    });

    Object.entries(musicFileUrls).map(([key, fileUrls]) => {
      this.music.register(key, fileUrls);
    });

    this.music.load();
  }

  async loadLevelAudio(levelName) {
    const soundFileUrls = {};

    const voiceOverDirPath = levelLoader.getConversationsVoiceOverDir(
      levelName
    );
    const voiceOverFiles = await readDirectory(voiceOverDirPath);

    if (voiceOverFiles === undefined) {
      // There is nothing to load, so short circuit
      return;
    }

    const voiceOverReadPromises = voiceOverFiles.map(async fileName => {
      const fileExtension = path.extname(fileName);

      if (SUPPORTED_FILE_EXTENSIONS.includes(fileExtension)) {
        const baseName = path.basename(fileName, fileExtension);
        const relativeFilePath = path.join(voiceOverDirPath, fileName);
        const fileUrl = toAssetSrc(
          await resolveAbsolutePath(relativeFilePath)
        );

        // Initialize sound file url for our base name,
        // or add this file url to the existing list
        soundFileUrls[baseName] = soundFileUrls[baseName]
          ? [...soundFileUrls[baseName], fileUrl]
          : [fileUrl];
      }
    });

    await Promise.all(voiceOverReadPromises);

    Object.entries(soundFileUrls).map(([key, fileUrls]) => {
      this.vo.register(key, fileUrls);
    });

    this.vo.load();
  }
}

const audioManager = new AudioManager();

const useAudioManager = () => {
  const [audioState, setState] = useState(audioManager.getState());

  const syncAudioState = () => {
    setState(audioManager.getState());
    audioManager.saveState();
  };

  return { audioState, syncAudioState, audioManager };
};

export { useAudioManager };
export default audioManager;
