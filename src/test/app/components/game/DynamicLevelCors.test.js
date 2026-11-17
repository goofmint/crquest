import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';

// Issue #166: images come from the Tauri asset protocol (another origin). The
// Phaser 2 loader must request them with a CORS mode, otherwise WebGL
// texImage2D throws a SecurityError and the level never starts. The check
// parses the source (importing DynamicLevel needs the full game environment),
// so a commented-out line does not satisfy it.
const source = fs.readFileSync(
  path.resolve(__dirname, '../../../../js/app/components/game/DynamicLevel.js'),
  'utf8'
);

const findPreload = () => {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const classDecl = ast.program.body
    .map(node => node.declaration || node)
    .find(node => node.type === 'ClassDeclaration');
  return classDecl.body.body.find(
    member => member.type === 'ClassMethod' && member.key.name === 'preload'
  );
};

describe('DynamicLevel.preload', () => {
  test('first statement assigns this.game.load.crossOrigin = "anonymous"', () => {
    const [first] = findPreload().body.body;
    expect(first.type).toBe('ExpressionStatement');
    const { expression } = first;
    expect(expression.type).toBe('AssignmentExpression');
    expect(expression.operator).toBe('=');
    expect(source.slice(expression.left.start, expression.left.end)).toBe(
      'this.game.load.crossOrigin'
    );
    expect(expression.right.type).toBe('StringLiteral');
    expect(expression.right.value).toBe('anonymous');
  });
});
