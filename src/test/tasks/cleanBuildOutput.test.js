const path = require('path');
const { spawnSync } = require('child_process');
const {
  GENERATED_PATHS,
} = require('../../../tasks/clean_build_output');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

// A path inside the generated directory, so directory rules ("public/app/")
// match as well
function probePath(relativePath) {
  return path.extname(relativePath)
    ? `public/${relativePath}`
    : `public/${relativePath}/probe.js`;
}

describe('clean_build_output', () => {
  it.each(GENERATED_PATHS)('only deletes git-ignored path %s', relativePath => {
    const result = spawnSync('git', ['check-ignore', '-q', probePath(relativePath)], {
      cwd: repoRoot,
    });

    expect(result.status).toBe(0);
  });

  it('does not touch the static assets of public/', () => {
    ['images', 'lib', 'levels', 'content', 'code_runner', 'node_modules'].forEach(
      dir => expect(GENERATED_PATHS).not.toContain(dir)
    );
  });
});
