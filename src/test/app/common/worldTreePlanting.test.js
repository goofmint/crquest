vi.mock('../../../js/app/common/levelLoader', () => ({ __esModule: true, default: {} }));
vi.mock('../../../js/app/common/audio', () => ({ __esModule: true, default: {} }));
vi.mock('../../../js/app/common/tiled', () => ({ __esModule: true, default: {} }));
vi.mock('../../../js/app/common/analytics', () => ({ __esModule: true, default: {} }));
vi.mock('../../../js/app/common/context', () => ({ setContext: vi.fn(), getContext: vi.fn(), emitter: {} }));
vi.mock('../../../js/app/common/fs_utils', () => ({ staticFilePath: vi.fn(() => '/static') }));
vi.mock('../../../js/app/common/treePlanting', () => ({ recordTreePlanting: vi.fn().mockResolvedValue('recorded') }));

import World from '../../../js/app/common/world';
import { recordTreePlanting } from '../../../js/app/common/treePlanting';

describe('world.recordTreePlanting', () => {
  test('is part of the content API and uses the current level as the mission', async () => {
    const world = new World({ levelName: 'dev_skills' });
    const api = world.generateAPI();
    expect(typeof api.recordTreePlanting).toBe('function');
    await expect(api.recordTreePlanting('devskills_tree1')).resolves.toBe('recorded');
    expect(recordTreePlanting).toHaveBeenCalledWith({ missionId: 'dev_skills', targetId: 'devskills_tree1' });
  });
});
