import { getContext, setContext } from '../../../../js/app/common/context';
import levelLoader from '../../../../js/app/common/levelLoader';
import { getLanguage } from '../../../../js/app/i18n';
import localizeQuestStatus from '../../../../js/app/components/context_provider/localizeQuestStatus';

vi.mock('../../../../js/app/common/context', () => ({
  getContext: vi.fn(),
  setContext: vi.fn(),
}));
vi.mock('../../../../js/app/common/levelLoader', () => ({
  default: { getLevel: vi.fn(), readLevelConfig: vi.fn() },
}));
vi.mock('../../../../js/app/i18n', () => ({
  getLanguage: vi.fn(),
  LANGUAGES: { en: 'English', ja: '日本語' },
}));

const level = {
  en: { questTitle: 'The Fog Owl', description: 'Explore the ship' },
  ja: { questTitle: 'フォグ・オウル号', description: '船を探索する' },
};

beforeEach(() => {
  vi.resetAllMocks();
  levelLoader.readLevelConfig.mockImplementation(async (_, code) => level[code]);
});

test.each([['en', 'ja'], ['ja', 'en']])('restores saved quest defaults from %s to %s', async (from, to) => {
  const saved = {
    owl: { title: level[from].questTitle, description: 'Custom', complete: true },
    forgotten: { title: 'Unknown mission', description: 'Unknown details' },
    anotherOwl: { title: 'Custom title', description: level[from].description },
  };
  getLanguage.mockReturnValue(to);
  getContext.mockReturnValue(saved);
  levelLoader.getLevel.mockImplementation(name => name === 'forgotten' ? undefined : level[to]);

  await localizeQuestStatus();

  expect(setContext).toHaveBeenCalledWith({
    questStatus: {
      owl: { title: level[to].questTitle, description: 'Custom', complete: true },
      forgotten: saved.forgotten,
      anotherOwl: { title: 'Custom title', description: level[to].description },
    },
  });
});

test('leaves already localized or custom text unchanged', async () => {
  getLanguage.mockReturnValue('ja');
  getContext.mockReturnValue({ owl: { title: 'フォグ・オウル号', description: 'Custom' } });
  levelLoader.getLevel.mockReturnValue(level.ja);

  await localizeQuestStatus();

  expect(setContext).not.toHaveBeenCalled();
});
