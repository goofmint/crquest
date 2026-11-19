import React, { useState } from 'react';
import useSpriteSheet from '../hooks/useSpriteSheet';

const NavMapButton = ({
  onClick,
  label,
  visibleLabel,
  config: { sheet, tileWidth, tileHeight, scale, raisedFrame, pressedFrame },
}) => {
  const [pressed, setPressed] = useState(false);
  const createSprite = useSpriteSheet({
    sheet,
    tileWidth,
    tileHeight,
    scale,
  });

  if (!raisedFrame) {
    raisedFrame = { row: 1, col: 0 };
  }

  if (!pressedFrame) {
    pressedFrame = { row: 1, col: 1 };
  }

  return (
    <button
      className="nav-map__button"
      aria-label={label}
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
    >
      {createSprite({
        row: pressed ? pressedFrame.row : raisedFrame.row,
        col: pressed ? pressedFrame.col : raisedFrame.col,
      })}
      {visibleLabel && (
        <span aria-hidden="true" className="nav-map__button-label">
          {visibleLabel}
        </span>
      )}
    </button>
  );
};

export default NavMapButton;
