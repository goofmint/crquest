import React from 'react';
import { useTranslation } from 'react-i18next';
import useSpriteSheet from '../hooks/useSpriteSheet';

const DestinationSelectLabel = ({ assets }) => {
  const { t } = useTranslation();
  const createDestSelectBox = useSpriteSheet({
    sheet: assets.destSelectBox,
    tileWidth: 32,
    tileHeight: 29,
    scale: 2,
  });

  return (
    <div
      className="levelSelect__container"
      style={{
        height: `${29 * 4}px`,
        width: `${32 * 4 * 4}px`,
        position: 'absolute',
        top: 0,
        left: 'calc(50% - 512px / 2 + 16px)', // why is this 16px and not 32px...?
        marginTop: '-4rem',
      }}
    >
      <p style={{ paddingTop: '6px' }}>{t('ui.map.select')}</p>
      <div className="levelSelect__background">
        {createDestSelectBox({ row: 0, col: 0 })}
        {createDestSelectBox({ row: 0, col: 1 })}
        {createDestSelectBox({ row: 0, col: 1 })}
        {createDestSelectBox({ row: 0, col: 1 })}
        {createDestSelectBox({ row: 0, col: 1 })}
        {createDestSelectBox({ row: 0, col: 5 })}
      </div>
    </div>
  );
};

export default DestinationSelectLabel;
