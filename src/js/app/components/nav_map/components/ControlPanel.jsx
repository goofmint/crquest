import React from 'react';
import { useTranslation } from 'react-i18next';
import useAssetLoader from '../hooks/useAssetLoader';
import { getByIndexWithWrapping } from '../utils';
import DestinationSelectLabel from './DestinationSelectLabel';
import LevelSelect from './LevelSelect';
import NavMapButton from './NavMapButton';
import NineSlice from './NineSlice';

const ControlPanel = ({
  hide,
  go,
  planets,
  selectedKey,
  selectPlanet,
  currentLevelTitle,
}) => {
  const { t, i18n } = useTranslation();
  const { assets } = useAssetLoader();
  const localized = i18n.resolvedLanguage !== 'en';
  const actionFrames = localized
    ? { raisedFrame: { row: 0, col: 0 }, pressedFrame: { row: 0, col: 1 } }
    : {};

  return (
    <NineSlice
      imageUrl={assets.controlBox}
      containerClassNames="nav-map__control-panel"
      contentClassNames="nine-slice__content--row"
    >
      <NavMapButton
        onClick={hide}
        label={t('ui.map.exit')}
        visibleLabel={localized ? t('ui.map.exitButton') : undefined}
        config={{
          sheet: assets.buttonExit,
          tileWidth: 90,
          tileHeight: 44,
          scale: 2,
          ...actionFrames,
        }}
      />
      <DestinationSelectLabel assets={assets} />
      <LevelSelect
        assets={assets}
        selectedKey={selectedKey}
        currentLevelTitle={currentLevelTitle}
        planets={planets}
        selectNext={() => {
          const selectedIndex = planets.findIndex(
            planet => planet.levelName === selectedKey
          );

          const newPlanet = getByIndexWithWrapping(selectedIndex + 1, planets);

          if (newPlanet) selectPlanet(newPlanet.levelName);
        }}
        selectPrev={() => {
          const selectedIndex = planets.findIndex(
            planet => planet.levelName === selectedKey
          );

          const newPlanet = getByIndexWithWrapping(selectedIndex - 1, planets);

          if (newPlanet) selectPlanet(newPlanet.levelName);
        }}
        selectPlanet={selectPlanet}
      />
      <NavMapButton
        onClick={go}
        label={t('ui.map.go')}
        visibleLabel={localized ? t('ui.map.goButton') : undefined}
        config={{
          sheet: assets.buttonGo,
          tileWidth: 75,
          tileHeight: 44,
          scale: 2,
          ...actionFrames,
        }}
      />
    </NineSlice>
  );
};

export default ControlPanel;
