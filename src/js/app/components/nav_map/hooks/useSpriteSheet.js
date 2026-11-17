import { useMemo } from 'react';
import SpriteSheet from '../../SpriteSheet';

const useSpriteSheet = ({ sheet, tileWidth, tileHeight, scale }) => {
  const createSprite = useMemo(() => {
    // SpriteSheet is an arrow function (a factory), not a constructor: `new`
    // throws "is not a constructor" once arrow functions are no longer
    // transpiled to plain functions (issue #170).
    return SpriteSheet({
      sheet,
      tileWidth,
      tileHeight,
      scale,
    });
  }, [sheet, tileWidth, tileHeight, scale]);

  return createSprite;
};

export default useSpriteSheet;
