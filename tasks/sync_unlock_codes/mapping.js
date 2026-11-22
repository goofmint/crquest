// 運用者が用意した「解除コード → アイテム」の対応表を検証する (純粋関数)。
// 入力: {"codes": [{"code": "...", "item_key": "..."}]} (配列だけでも可)。
// コードは秘匿情報なので、エラーメッセージには値を出さず、項目の番号だけを示す。
// 規則はサーバー (publish_unlock_codes) と同じ: コードは前後に (Unicode を含む) 空白がなく 1〜128 文字、大文字と小文字は区別する。

const fs = require('fs');
const path = require('path');

const MAX_LENGTH = 128;
// 前後の空白 (ASCII と Unicode): JS の trim() と Rust の trim() が除去するものの和集合。サーバー (publish_unlock_codes) の拒否規則と同じ。
const WHITESPACE = /^[\t\n\v\f\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]|[\t\n\v\f\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]$/;

class MappingError extends Error {
  constructor(problems) {
    super(`対応表に問題がある (${problems.length} 件):\n${problems.map(p => `  - ${p}`).join('\n')}`);
    this.problems = problems;
  }
}

/** 拡張ディレクトリ (…/<extension>/items/<name>/index.json) から、導入済みのアイテムキー (index.json の name) を集める。 */
function readItemKeys(extensionPaths) {
  const keys = new Set();
  for (const extensionPath of extensionPaths) {
    const itemsDir = path.join(extensionPath, 'items');
    let names;
    try {
      names = fs.readdirSync(itemsDir);
    } catch (error) {
      continue; // items が無い (未導入の拡張など)
    }
    for (const name of names) {
      try {
        const item = JSON.parse(fs.readFileSync(path.join(itemsDir, name, 'index.json'), 'utf8'));
        if (item && typeof item.name === 'string' && item.name) keys.add(item.name);
      } catch (error) {
        // index.json が無い・壊れているディレクトリはアイテムとして数えない
      }
    }
  }
  return keys;
}

/**
 * @param {unknown} raw JSON.parse した入力
 * @param {Set<string>} itemKeys 導入済みのアイテムキー
 * @returns {{codes: Array<{code: string, item_key: string}>}} サーバーに渡す payload
 * @throws {MappingError}
 */
function validateMapping(raw, itemKeys) {
  const entries = Array.isArray(raw) ? raw : raw && Array.isArray(raw.codes) ? raw.codes : null;
  if (!entries) {
    throw new MappingError(['入力は配列、または {"codes": [...]} でなければならない']);
  }
  if (entries.length === 0) {
    throw new MappingError(['対応表が空である']);
  }

  const problems = [];
  const firstItemByCode = new Map();
  const codes = [];

  entries.forEach((entry, index) => {
    const where = `#${index + 1}`;
    if (!entry || typeof entry !== 'object' || typeof entry.code !== 'string' || typeof entry.item_key !== 'string') {
      problems.push(`${where}: code と item_key は文字列でなければならない`);
      return;
    }
    const { code, item_key: itemKey } = entry;
    let valid = true;
    // Unicode code points, like the server (char_length) and the desktop checks.
    const length = [...code].length;
    if (length < 1 || length > MAX_LENGTH) {
      problems.push(`${where}: code は 1〜${MAX_LENGTH} 文字でなければならない`);
      valid = false;
    } else if (WHITESPACE.test(code)) {
      problems.push(`${where}: code の前後に空白があってはならない`);
      valid = false;
    }
    if (!itemKeys.has(itemKey)) {
      problems.push(`${where}: item_key "${itemKey}" は同梱のアイテムカタログに無い`);
      valid = false;
    }
    if (!valid) return;

    if (firstItemByCode.has(code)) {
      problems.push(
        firstItemByCode.get(code) === itemKey
          ? `${where}: code が重複している (同じアイテム)`
          : `${where}: 同じ code が異なるアイテムに対応している`
      );
      return;
    }
    firstItemByCode.set(code, itemKey);
    codes.push({ code, item_key: itemKey });
  });

  if (problems.length > 0) throw new MappingError(problems);
  return { codes };
}

module.exports = { validateMapping, readItemKeys, MappingError, MAX_LENGTH };
