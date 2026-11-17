import fs from 'fs';
import path from 'path';

// Issue #166: images come from the Tauri asset protocol (another origin). The
// Phaser 2 loader must request them with a CORS mode, otherwise WebGL
// texImage2D throws a SecurityError and the level never starts. Pin it in the
// source (importing DynamicLevel needs the full game environment).
const source = fs.readFileSync(
  path.resolve(__dirname, '../../../../js/app/components/game/DynamicLevel.js'),
  'utf8'
);

describe('DynamicLevel.preload', () => {
  test('sets the loader crossOrigin to anonymous before any load call', () => {
    const preload = source.slice(source.indexOf('  preload() {'));
    const cors = preload.indexOf("this.game.load.crossOrigin = 'anonymous'");
    expect(cors).toBeGreaterThan(-1);
    expect(cors).toBeLessThan(preload.indexOf('this.loadEntityConfigs()'));
    expect(cors).toBeLessThan(preload.indexOf('this.game.load.spritesheet'));
  });
});
