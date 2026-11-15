import path from 'path';
import { existsAsync } from '../../platform/fs';
import { toAssetSrc } from '../../platform/assets';
import {
  readDirectory,
  readFile,
  resolveAbsolutePath,
} from '../../common/assetLoader';

const ITEMS_DIR = 'items';

export default async function loadItemsFromDisk() {
  const items = {};
  const itemDirs = await readDirectory(ITEMS_DIR);

  const getItemPromises = itemDirs.map(async dirName => {
    const itemPath = path.join(ITEMS_DIR, dirName);
    const fullItemPath = await resolveAbsolutePath(itemPath);

    if ((await existsAsync(fullItemPath)) !== 'dir') {
      // Items need to be directories
      return;
    }

    const jsonPath = path.join(itemPath, 'index.json');
    const jsonContents = await readFile(jsonPath);
    const config = JSON.parse(jsonContents);

    items[config.name] = Object.assign(
      {
        iconPath: toAssetSrc(
          await resolveAbsolutePath(`items/${config.name}/icon.png`)
        ),
        layerPath: toAssetSrc(
          await resolveAbsolutePath(`items/${config.name}/layer.png`)
        ),
        layerReversePath: toAssetSrc(
          await resolveAbsolutePath(`items/${config.name}/layer_reverse.png`)
        ),
      },
      config
    );
  });

  await Promise.all(getItemPromises);

  return items;
}
