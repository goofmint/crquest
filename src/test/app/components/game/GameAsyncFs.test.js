import fs from 'fs';
import path from 'path';

// The Tauri platform/fs rejects the synchronous list/exists/read members
// (they throw "use the *Async variant"). Game.loadLevel runs on every level
// load; a synchronous call there aborts the load before the Player and its
// keyboard keys are created (#150). Pin the async usage.
const gameSource = fs.readFileSync(
  path.resolve(__dirname, '../../../../js/app/components/game/Game.jsx'),
  'utf8'
);

describe('Game.jsx platform fs usage', () => {
  test('imports only the async fs members', () => {
    const importLine = gameSource.match(
      /import \{([^}]*)\} from '..\/..\/platform\/fs';/
    );
    expect(importLine).not.toBeNull();
    const names = importLine[1].split(',').map(name => name.trim());
    expect(names).toEqual(['listAsync', 'existsAsync', 'readAsync']);
  });

  test('lists the legacy entities directory with an awaited listAsync', () => {
    expect(gameSource).toContain(
      'for (const entityKey of await listAsync(commonEntitiesDir))'
    );
  });

  test('has no call of the synchronous list / exists / read', () => {
    expect(gameSource).not.toMatch(/(^|[^.\w])(list|exists|read)\(/m);
  });
});
