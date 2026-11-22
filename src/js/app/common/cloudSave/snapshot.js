/**
 * What goes to the cloud save, and how a received save is checked.
 *
 * Included: the game fields marked `cloudSave: true` in the context schema.
 * Not included: `env` (secrets), `extensions` (paths of this computer), `user`
 * (the local GUID), `liveEvent`, audio keys, QuestIDE code files and IndexedDB.
 *
 * The cloud save is self-reported data: nothing in it may feed rankings or team
 * scores (docs/supabase/cloud-save.md).
 */
import { describeSchema, validateContextUpdate } from '../context/schema';

/** Bump when the shape of the snapshot changes in a way old clients cannot read. */
export const CLOUD_SAVE_SCHEMA_VERSION = 1;

/** Per-installation flags that must not travel between computers. */
const LOCAL_ONLY_MIGRATIONS = ['2020-09-16_analytics_id_to_user_guid'];

/** Items every new player starts with: owning only these is not progress. */
const STARTER_ITEMS = ['tshirt', 'jeans'];

export function getCloudSaveFields() {
  return Object.entries(describeSchema().fields)
    .filter(([, field]) => field.meta && field.meta.cloudSave)
    .map(([key]) => key);
}

function withoutLocalOnlyMigrations(migrations) {
  return Object.fromEntries(
    Object.entries(migrations || {}).filter(([key]) => !LOCAL_ONLY_MIGRATIONS.includes(key))
  );
}

/**
 * An immutable, JSON-normalized copy of the cloud save fields of `context`
 * (dates become ISO strings, as in the local store).
 */
export function createSnapshot(context) {
  const snapshot = {};
  for (const key of getCloudSaveFields()) {
    if (context[key] === undefined) continue;
    snapshot[key] = key === 'migrations' ? withoutLocalOnlyMigrations(context[key]) : context[key];
  }
  return Object.freeze(JSON.parse(JSON.stringify(snapshot)));
}

/**
 * Checks a received snapshot against the same schema as `setContext`.
 * Fields that are not cloud save fields are dropped.
 * @returns {{ ok: true, values: object } | { ok: false }}
 */
export function validateSnapshot(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false };
  }
  const fields = getCloudSaveFields();
  const values = {};
  for (const key of Object.keys(data)) {
    if (!fields.includes(key)) continue;
    const [result] = validateContextUpdate({ [key]: data[key] });
    if (!result.valid) {
      return { ok: false };
    }
    // The accepted (cast) value, JSON-normalized, not the raw input.
    values[key] = JSON.parse(JSON.stringify(result.update));
  }
  if (values.migrations) {
    values.migrations = withoutLocalOnlyMigrations(values.migrations);
  }
  return { ok: true, values };
}

const isFilled = value => value !== null && typeof value === 'object' && Object.keys(value).length > 0;

/**
 * Whether a snapshot holds game progress. Names, GUIDs and the mere presence of
 * keys do not count: a player who only opened the game has none.
 */
export function hasMeaningfulProgress(snapshot) {
  if (!snapshot) return false;
  return (
    isFilled(snapshot.completedObjectives) ||
    (typeof snapshot.xp === 'number' && snapshot.xp > 0) ||
    isFilled(snapshot.questStatus) ||
    isFilled(snapshot.levelState) ||
    (Array.isArray(snapshot.inventory) &&
      snapshot.inventory.some(item => !STARTER_ITEMS.includes(item)))
  );
}

export function summarize(snapshot) {
  return {
    xp: typeof snapshot?.xp === 'number' ? snapshot.xp : 0,
    objectives: snapshot?.completedObjectives ? Object.keys(snapshot.completedObjectives).length : 0,
  };
}

/** A flag that is done on either side stays done. Per-installation flags stay local. */
export function mergeMigrations(local, remote) {
  const merged = { ...withoutLocalOnlyMigrations(remote) };
  for (const [key, done] of Object.entries(local || {})) {
    merged[key] = Boolean(merged[key] || done);
  }
  return merged;
}
