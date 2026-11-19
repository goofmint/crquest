import { getLanguage, LANGUAGES } from '../../i18n';
import levelLoader from '../../common/levelLoader';
import { getContext, setContext } from '../../common/context';

const QUEST_FIELDS = {
  title: 'questTitle',
  description: 'questDescription',
};

function defaultQuestText(level, field) {
  return level[QUEST_FIELDS[field]] || level[field];
}

export default async function localizeQuestStatus() {
  const saved = getContext('questStatus');
  if (!saved) return;

  const language = getLanguage();
  const otherLanguages = Object.keys(LANGUAGES).filter(code => code !== language);
  const updates = await Promise.all(Object.entries(saved).map(async ([levelName, status]) => {
    const current = levelLoader.getLevel(levelName);
    if (!current || !status) return;

    const fields = Object.keys(QUEST_FIELDS).filter(field =>
      typeof status[field] === 'string' &&
      typeof defaultQuestText(current, field) === 'string' &&
      status[field] !== defaultQuestText(current, field)
    );
    if (!fields.length) return;

    const defaults = await Promise.all(otherLanguages.map(code =>
      levelLoader.readLevelConfig(levelName, code)
    ));
    const translations = fields
      .filter(field => defaults.some(level => level &&
        defaultQuestText(level, field) === status[field]))
      .map(field => [field, defaultQuestText(current, field)]);

    if (translations.length) {
      return [levelName, { ...status, ...Object.fromEntries(translations) }];
    }
  }));

  const changed = updates.filter(Boolean);
  if (changed.length) {
    setContext({ questStatus: { ...saved, ...Object.fromEntries(changed) } });
  }
}
