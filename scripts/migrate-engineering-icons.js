const fs = require('fs');
const path = require('path');
const parser = require('../frontend/node_modules/@babel/parser');
const traverse = require('../frontend/node_modules/@babel/traverse').default;

const root = path.join(__dirname, '..', 'frontend', 'src');
const extensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const pictographic = /\p{Extended_Pictographic}/u;

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(filePath);
    return extensions.has(path.extname(entry.name)) ? [filePath] : [];
  });
}

function relativeImport(filePath) {
  const target = path.join(root, 'components', 'shared', 'EngineeringIcon');
  let value = path.relative(path.dirname(filePath), target).replaceAll('\\', '/');
  if (!value.startsWith('.')) value = `./${value}`;
  return value;
}

function isUserContentExpression(source) {
  return /(?:\.content|description|tagline|bio|comment|message)/i.test(source);
}

for (const filePath of sourceFiles(root)) {
  if (filePath.endsWith(`${path.sep}EngineeringIcon.jsx`)) continue;
  const source = fs.readFileSync(filePath, 'utf8');
  if (!pictographic.test(source)) continue;

  let ast;
  try {
    ast = parser.parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: false,
    });
  } catch (error) {
    console.warn(`Skipped ${path.relative(root, filePath)}: ${error.message}`);
    continue;
  }

  const replacements = [];
  let needsImport = false;

  traverse(ast, {
    JSXText(nodePath) {
      const value = nodePath.node.value;
      if (!pictographic.test(value)) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      replacements.push({
        start: nodePath.node.start,
        end: nodePath.node.end,
        value: `<IconText text=${JSON.stringify(trimmed)} />`,
      });
      needsImport = true;
    },
    JSXExpressionContainer(nodePath) {
      if (nodePath.parentPath?.isJSXAttribute()) return;
      const expression = nodePath.node.expression;
      if (!expression || expression.type === 'JSXEmptyExpression') return;
      const expressionSource = source.slice(expression.start, expression.end);
      if (expressionSource.includes('<IconText') || isUserContentExpression(expressionSource)) return;

      const propertyName = expression.type === 'MemberExpression' && !expression.computed
        ? expression.property?.name
        : null;
      const isKnownRenderSlot = propertyName === 'icon'
        || propertyName === 'label'
        || (expression.type === 'Identifier' && ['icon', 'label'].includes(expression.name))
        || /(?:CATEGORY_ICONS|SOURCE_ICONS|getTeamIcon|getFileIcon|getTypeIcon)/.test(expressionSource);
      const containsLiteralEmoji = pictographic.test(expressionSource);
      if (!containsLiteralEmoji && !isKnownRenderSlot) return;

      replacements.push({
        start: nodePath.node.start,
        end: nodePath.node.end,
        value: `<IconText text={${expressionSource}} />`,
      });
      needsImport = true;
      nodePath.skip();
    },
  });

  if (!needsImport || replacements.length === 0) continue;
  if (!source.includes("from '../components/shared/EngineeringIcon'")
      && !source.includes("from './EngineeringIcon'")
      && !source.includes("from '../shared/EngineeringIcon'")) {
    const imports = ast.program.body.filter(node => node.type === 'ImportDeclaration');
    const insertAt = imports.length ? imports[imports.length - 1].end : 0;
    replacements.push({
      start: insertAt,
      end: insertAt,
      value: `\nimport { IconText } from '${relativeImport(filePath)}';`,
    });
  }

  replacements.sort((a, b) => b.start - a.start);
  let output = source;
  for (const replacement of replacements) {
    output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
  }
  fs.writeFileSync(filePath, output);
  console.log(`${path.relative(root, filePath)}: ${replacements.length} updates`);
}
