// readLevels() の結果から、Supabase に発行するカタログを決定的に作る (純粋関数)。
// ランタイム (levelLoader) と同じ規約: 目標は level.json の objectives マニフェストに記載されたもの、
// ID は「レベルのディレクトリ名」と「目標名」、完了キーは `levelName.objectiveName`。
// 公開するのは原文の title / description / XP などだけ。validator.js / validation_fields /
// 報酬アイテム / マップ / 翻訳は含めない。

function compareStrings(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// スラッシュを含む参照は、ランタイムと同じく最後の要素を目標名とする。
function toObjectiveName(reference) {
  return String(reference).split('/').pop();
}

function toXp(objective, where) {
  const xp = objective.rewards?.xp ?? 0;
  if (typeof xp !== 'number' || !Number.isInteger(xp) || xp < 0) {
    throw new Error(
      `${where}: rewards.xp は 0 以上の整数でなければならない (値: ${JSON.stringify(xp)})`
    );
  }
  return xp;
}

function requireText(value, where, field) {
  if (typeof value !== 'string') {
    throw new Error(`${where}: ${field} が文字列ではない`);
  }
  return value;
}

/**
 * @param {Array<{extensionName: string, levels: object[]}>} sources 拡張名とその readLevels() の結果
 * @returns {{missions: object[]}}
 */
function buildCatalog(sources) {
  const owners = new Map();
  const missions = [];

  for (const { extensionName, levels } of sources) {
    for (const level of levels) {
      const id = level.levelName;
      const levelWhere = `${extensionName}/levels/${id}`;

      if (owners.has(id)) {
        throw new Error(
          `ミッション ID "${id}" が重複している: ${owners.get(id)} と ${extensionName}`
        );
      }
      owners.set(id, extensionName);

      if (level.objectives !== undefined && !Array.isArray(level.objectives)) {
        throw new Error(`${levelWhere}: level.json の objectives は配列でなければならない`);
      }
      // 空配列は正当 (既存の目標を退役させる)。未指定も空として扱う。
      const manifest = level.objectives ?? [];
      const byName = new Map(
        (level.missionData?.objectives ?? []).map(objective => [
          objective.objectiveName,
          objective,
        ])
      );

      const seen = new Set();
      const objectives = manifest.map(reference => {
        const name = toObjectiveName(reference);
        const where = `${levelWhere}/objectives/${name}`;

        if (seen.has(name)) {
          throw new Error(`${levelWhere}: 目標 "${name}" がマニフェストで重複している`);
        }
        seen.add(name);

        const objective = byName.get(name);
        if (!objective) {
          throw new Error(
            `${where}: マニフェストの目標に objective.json がない`
          );
        }

        return {
          id: name,
          title: requireText(objective.title, where, 'title'),
          description: requireText(objective.description ?? '', where, 'description'),
          xp: toXp(objective, where),
        };
      });

      missions.push({
        id,
        extension: extensionName,
        title: requireText(level.title, levelWhere, 'title'),
        description: requireText(level.description ?? '', levelWhere, 'description'),
        is_mission: level.is_mission === true,
        objectives,
      });
    }
  }

  missions.sort((a, b) => compareStrings(a.id, b.id));
  return { missions };
}

module.exports = { buildCatalog, toObjectiveName };
