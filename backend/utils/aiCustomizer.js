const vm = require('vm');

const BLOCK_START = (id) => `/* pf-ai:block:${id} */`;
const BLOCK_END = (id) => `/* pf-ai:end:${id} */`;

const VALID_THEME_KEYS = new Set([
  'cardBackground',
  'cardBorderRadius',
  'cardShadow',
  'cardBorder',
  'cardPadding',
  'cardTitleColor',
  'cardTextColor',
  'headerGradient',
  'headerTextColor',
  'pageBackground',
  'accentColor',
  'fontFamily',
  'projectsGap',
  'skillTagBackground',
  'skillTagColor',
  'sectionPadding',
  'headerPadding',
]);

const VALID_ANIMATIONS = {
  cardEntrance: new Set(['fadeUp', 'slideIn', 'zoomIn', 'none']),
  cardHover: new Set(['lift', 'glow', 'scale', 'tilt', 'none']),
  pageBackground: new Set(['particles', 'gradient-shift', 'none']),
};

const DEFAULT_ANIMATIONS = {
  cardEntrance: 'none',
  cardHover: 'none',
  pageBackground: 'none',
};

const KNOWN_DOM_IDS = new Set(['pf-root']);

const unsafeJsPatterns = [
  {
    pattern: /\.innerHTML\s*=/i,
    message: 'Do not assign innerHTML in generated JavaScript. Use site_sections for content and CSS for styling.',
  },
  {
    pattern: /\.outerHTML\s*=/i,
    message: 'Do not assign outerHTML in generated JavaScript. It can break React-owned portfolio markup.',
  },
  {
    pattern: /\.insertAdjacentHTML\s*\(/i,
    message: 'Do not use insertAdjacentHTML in generated JavaScript. Use native sections or safe CSS instead.',
  },
  {
    pattern: /\.removeChild\s*\(/i,
    message: 'Do not call removeChild in generated JavaScript. React owns the portfolio DOM tree.',
  },
  {
    pattern: /\.remove\s*\(/i,
    message: 'Do not call remove in generated JavaScript. ProjectFolio cleans up data-pf-ai-artifact nodes between runs.',
  },
  {
    pattern: /\.replaceChildren\s*\(/i,
    message: 'Do not call replaceChildren in generated JavaScript. React owns the portfolio DOM tree.',
  },
  {
    pattern: /\.replaceWith\s*\(/i,
    message: 'Do not call replaceWith in generated JavaScript. React owns the portfolio DOM tree.',
  },
  {
    pattern: /\.replaceChild\s*\(/i,
    message: 'Do not call replaceChild in generated JavaScript. React owns the portfolio DOM tree.',
  },
  {
    pattern: /\bdocument\.write\s*\(/i,
    message: 'Do not use document.write in generated JavaScript.',
  },
  {
    pattern: /\beval\s*\(/i,
    message: 'Do not use eval in generated JavaScript.',
  },
  {
    pattern: /\bnew\s+Function\s*\(/i,
    message: 'Do not create functions from strings in generated JavaScript.',
  },
];

const normalizeBlockId = (value, fallback = 'generated') => {
  const raw = String(value || fallback).trim().toLowerCase();
  const id = raw
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return id || fallback;
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findJson = (input) => {
  const start = input.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }

  return null;
};

const escapeLiteralNewlines = (input) => {
  let out = '';
  let inString = false;
  let escaped = false;

  for (const ch of input) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      out += ch;
      inString = !inString;
      continue;
    }
    if (inString && ch === '\n') {
      out += '\\n';
      continue;
    }
    if (inString && ch === '\r') {
      out += '\\r';
      continue;
    }
    if (inString && ch === '\t') {
      out += '\\t';
      continue;
    }
    out += ch;
  }

  return out;
};

const parseAiJson = (raw) => {
  if (!raw || typeof raw !== 'string') {
    throw new Error('AI returned an empty response.');
  }

  let clean = raw.trim();
  const fence = clean.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) clean = fence[1].trim();

  const openBraces = (clean.match(/\{/g) || []).length;
  const closeBraces = (clean.match(/}/g) || []).length;
  if (openBraces > closeBraces + 2) {
    const err = new Error('AI response was cut off before valid JSON completed.');
    err.code = 'TRUNCATED';
    throw err;
  }

  clean = findJson(clean) || clean;
  clean = escapeLiteralNewlines(clean).replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(clean);
};

const normalizeText = (value) => {
  if (typeof value !== 'string') return '';
  return value.replace(/\\n/g, '\n').replace(/\\t/g, '  ').trim();
};

const parseJsonishObject = (value, fallback = {}) => {
  if (!value) return { ...fallback };
  if (typeof value === 'object' && !Array.isArray(value)) return { ...fallback, ...value };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && !Array.isArray(parsed) && parsed
        ? { ...fallback, ...parsed }
        : { ...fallback };
    } catch {
      return { ...fallback };
    }
  }
  return { ...fallback };
};

const extractMarkedBlocks = (code = '') => {
  const blocks = [];
  const pattern = /\/\*\s*pf-ai:block:([a-zA-Z0-9_-]+)\s*\*\/([\s\S]*?)\/\*\s*pf-ai:end:\1\s*\*\//g;
  for (const match of code.matchAll(pattern)) {
    blocks.push({ id: match[1], content: match[2].trim() });
  }
  return blocks;
};

const removeMarkedBlock = (code, id) => {
  const safeId = escapeRegExp(id);
  const pattern = new RegExp(
    `\\n?\\/\\*\\s*pf-ai:block:${safeId}\\s*\\*\\/[\\s\\S]*?\\/\\*\\s*pf-ai:end:${safeId}\\s*\\*\\/\\n?`,
    'g'
  );
  return code.replace(pattern, '\n').replace(/\n{3,}/g, '\n\n').trim();
};

const upsertMarkedBlock = (code, id, content) => {
  const block = `${BLOCK_START(id)}\n${content.trim()}\n${BLOCK_END(id)}`;
  const safeId = escapeRegExp(id);
  const pattern = new RegExp(
    `\\/\\*\\s*pf-ai:block:${safeId}\\s*\\*\\/[\\s\\S]*?\\/\\*\\s*pf-ai:end:${safeId}\\s*\\*\\/`,
    'g'
  );

  if (pattern.test(code)) {
    return code.replace(pattern, block).replace(/\n{3,}/g, '\n\n').trim();
  }

  return [code.trim(), block].filter(Boolean).join('\n\n').trim();
};

const normalizeBlockList = (value, codeKey, fallbackPrefix) => {
  if (!value) return [];
  const source = Array.isArray(value)
    ? value
    : typeof value === 'object'
      ? Object.entries(value).map(([id, content]) => ({ id, [codeKey]: content }))
      : [];

  return source
    .map((entry, index) => {
      const id = normalizeBlockId(entry.id || entry.name || `${fallbackPrefix}-${index + 1}`, `${fallbackPrefix}-${index + 1}`);
      const content = normalizeText(entry[codeKey] ?? entry.content ?? entry.code);
      return { id, content };
    })
    .filter((entry) => entry.content);
};

const mergeThemeOverrides = (current, patch, errors, warnings = []) => {
  const next = parseJsonishObject(current);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return next;

  for (const [key, value] of Object.entries(patch)) {
    if (!VALID_THEME_KEYS.has(key)) {
      warnings.push(`Ignored unknown theme override "${key}".`);
      continue;
    }
    if (value === null || value === undefined || value === '') {
      delete next[key];
      continue;
    }
    if (key === 'accentColor' && !/^#[0-9a-fA-F]{3,8}$/.test(String(value))) {
      warnings.push('Ignored accentColor because it was not a hex color like "#7c3aed".');
      continue;
    }
    next[key] = String(value);
  }

  return next;
};

const mergeAnimations = (current, patch, errors, warnings = []) => {
  const next = {
    ...DEFAULT_ANIMATIONS,
    ...parseJsonishObject(current),
  };
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return next;

  for (const [key, value] of Object.entries(patch)) {
    if (!VALID_ANIMATIONS[key]) {
      warnings.push(`Ignored unknown animation "${key}".`);
      continue;
    }
    const normalized = value === null || value === undefined || value === '' ? 'none' : String(value);
    if (!VALID_ANIMATIONS[key].has(normalized)) {
      warnings.push(`Ignored invalid animation ${key}: "${normalized}".`);
      continue;
    }
    next[key] = normalized;
  }

  return next;
};

const mergeCodeBlocks = (currentCode, blocks, removeBlocks) => {
  let next = currentCode || '';
  for (const id of removeBlocks) {
    next = removeMarkedBlock(next, id);
  }
  for (const block of blocks) {
    next = upsertMarkedBlock(next, block.id, block.content);
  }
  return next.trim();
};

const parseRemoveBlocks = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((id) => normalizeBlockId(id)).filter(Boolean);
};

const parseAndMergeAiResponse = (raw, current = {}) => {
  const parsed = parseAiJson(raw);
  const errors = [];
  const warnings = [];

  const hasPatchContract =
    Object.prototype.hasOwnProperty.call(parsed, 'themeOverridesPatch') ||
    Object.prototype.hasOwnProperty.call(parsed, 'animationsPatch') ||
    Object.prototype.hasOwnProperty.call(parsed, 'cssBlocks') ||
    Object.prototype.hasOwnProperty.call(parsed, 'jsBlocks') ||
    Object.prototype.hasOwnProperty.call(parsed, 'removeBlocks');

  const removeBlocks = parseRemoveBlocks(parsed.removeBlocks);
  let cssBlocks = normalizeBlockList(parsed.cssBlocks, 'css', 'css-block');
  let jsBlocks = normalizeBlockList(parsed.jsBlocks, 'js', 'js-block');
  let themePatch = parsed.themeOverridesPatch;
  let animationsPatch = parsed.animationsPatch;

  if (!hasPatchContract) {
    themePatch = parsed.themeOverrides || {};
    animationsPatch = parsed.animations || {};
    const legacyCss = normalizeText(parsed.customCss || parsed.css || '');
    const legacyJs = normalizeText(parsed.customJs || parsed.js || '');
    if (legacyCss) cssBlocks = [{ id: 'legacy-generated-css', content: legacyCss }];
    if (legacyJs) jsBlocks = [{ id: 'legacy-generated-js', content: legacyJs }];
  }

  const themeOverrides = mergeThemeOverrides(current.themeOverrides, themePatch, errors, warnings);
  const animations = mergeAnimations(current.animations, animationsPatch, errors, warnings);
  const css = mergeCodeBlocks(current.css || '', cssBlocks, removeBlocks);
  const js = mergeCodeBlocks(current.js || '', jsBlocks, removeBlocks);

  return {
    result: {
      themeOverrides,
      animations,
      css,
      js,
      customCss: css,
      customJs: js,
      description: typeof parsed.description === 'string' ? parsed.description : 'Updated your portfolio customization.',
      changedBlocks: {
        css: cssBlocks.map((block) => block.id),
        js: jsBlocks.map((block) => block.id),
        removed: removeBlocks,
      },
    },
    errors,
    warnings,
    parsed,
  };
};

const validateJs = (js = '') => {
  const errors = [];
  const warnings = [];
  if (!js.trim()) return { errors, warnings };

  try {
    new vm.Script(js);
  } catch (error) {
    errors.push(`JavaScript syntax error: ${error.message}`);
  }

  if (/DOMContentLoaded/.test(js)) {
    errors.push('Remove DOMContentLoaded listeners. Custom JS runs after React renders.');
  }
  if (/window\.onload\s*=/.test(js) || /addEventListener\(['"]load['"]/.test(js)) {
    errors.push('Remove window load handlers. Custom JS runs after the page is ready.');
  }
  if (/document\.addEventListener\(['"](resize|orientationchange)['"]/.test(js)) {
    errors.push("Use window.addEventListener('resize', ...) instead of document resize listeners.");
  }
  if (/setInterval\s*\(/.test(js)) {
    warnings.push('requestAnimationFrame is preferred over setInterval for visual effects.');
  }

  for (const rule of unsafeJsPatterns) {
    if (rule.pattern.test(js)) errors.push(rule.message);
  }

  const directReactDomMutation = (
    /document\.(?:querySelector|querySelectorAll)\(\s*['"`][^'"`]*(#pf-root|\.pf-)[^'"`]*['"`]\s*\)\s*(?:\.|\?\.)\s*(appendChild|prepend|append|before|after|insertBefore|remove|removeChild|replaceChildren|replaceWith|replaceChild)\s*\(/i.test(js)
    || /document\.getElementById\(\s*['"]pf-root['"]\s*\)\s*(?:\.|\?\.)\s*(appendChild|prepend|append|before|after|insertBefore|remove|removeChild|replaceChildren|replaceWith|replaceChild)\s*\(/i.test(js)
  );
  const reactOwnedVariables = new Set();
  for (const match of js.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*document\.(?:querySelector|querySelectorAll)\(\s*['"`]([^'"`]*(?:#pf-root|\.pf-)[^'"`]*)['"`]\s*\)/gi)) {
    reactOwnedVariables.add(match[1]);
  }
  for (const match of js.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*document\.getElementById\(\s*['"]pf-root['"]\s*\)/gi)) {
    reactOwnedVariables.add(match[1]);
  }
  const mutatesReactOwnedVariable = [...reactOwnedVariables].some((name) => (
    new RegExp(`\\b${escapeRegExp(name)}\\s*(?:\\.|\\?\\.)\\s*(appendChild|prepend|append|before|after|insertBefore|remove|removeChild|replaceChildren|replaceWith|replaceChild)\\s*\\(`, 'i').test(js)
  ));
  if (directReactDomMutation || mutatesReactOwnedVariable) {
    errors.push('Generated JavaScript cannot insert, remove, or reorder children inside #pf-root or .pf-* React-rendered nodes. Use site_sections, interactions, or CSS instead.');
  }

  if (/document\.createElement\s*\(/i.test(js) && !/data-pf-ai-artifact|dataset\.pfAiArtifact|setAttribute\(['"]data-pf-ai-artifact['"]\s*,\s*['"]true['"]\)/i.test(js)) {
    errors.push('Generated JavaScript that creates DOM nodes must mark them with data-pf-ai-artifact="true" so ProjectFolio can clean them up safely.');
  }

  const guardIds = [...js.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
  const createdIds = new Set([
    ...[...js.matchAll(/\.id\s*=\s*['"]([^'"]+)['"]/g)].map((match) => match[1]),
    ...[...js.matchAll(/setAttribute\(['"]id['"]\s*,\s*['"]([^'"]+)['"]\)/g)].map((match) => match[1]),
    ...[...js.matchAll(/id=["']([^"']+)["']/g)].map((match) => match[1]),
  ]);

  for (const id of guardIds) {
    if (!id.startsWith('pf-') || KNOWN_DOM_IDS.has(id)) continue;
    if (!createdIds.has(id)) {
      errors.push(`JavaScript checks #${id} with getElementById but never creates that element.`);
    }
  }

  return { errors, warnings };
};

const cssTimeToMs = (value = '') => {
  const match = String(value).trim().match(/^(-?\d*\.?\d+)(ms|s)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return match[2].toLowerCase() === 's' ? amount * 1000 : amount;
};

const extractCssTimeTokens = (value = '') => (
  [...String(value).matchAll(/(?:^|[\s,])(-?\d*\.?\d+(?:ms|s))(?=$|[\s,/,)])/gi)]
    .map((match) => cssTimeToMs(match[1]))
    .filter((time) => time != null)
);

const validateCss = (css = '', js = '') => {
  const errors = [];
  const warnings = [];
  if (!css.trim()) return { errors, warnings };

  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const hasKeyframes = /@keyframes\s+[\w-]+/i.test(withoutComments);
  const hasReducedMotionFallback = /prefers-reduced-motion\s*:\s*reduce/i.test(withoutComments);
  const referenced = new Set();
  for (const match of withoutComments.matchAll(/animation(?:-name)?\s*:\s*([^;{}]+)/gi)) {
    const first = match[1].trim().split(/\s+/)[0];
    if (first) referenced.add(first);
  }
  for (const match of js.matchAll(/\.style\.animation\s*=\s*['"`]([\w-]+)/g)) {
    referenced.add(match[1]);
  }
  const defined = new Set([...withoutComments.matchAll(/@keyframes\s+([\w-]+)/gi)].map((match) => match[1]));
  for (const name of referenced) {
    if (['none', 'initial', 'inherit', 'unset'].includes(name)) continue;
    if (!defined.has(name)) errors.push(`@keyframes "${name}" is referenced but not defined.`);
  }
  if ((hasKeyframes || referenced.size > 0) && !hasReducedMotionFallback) {
    errors.push('Custom CSS animations must include @media (prefers-reduced-motion: reduce). Prefer native interaction recipes for motion.');
  }

  for (const match of withoutComments.matchAll(/([^{}@][^{}]*?)\s*\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    const declarations = match[2];
    if (!selector) continue;

    const rootSelector = /(^|,)\s*(html|body|:root|#root)\b/i.test(selector);
    const unsafeSelector = /(^|,)\s*(\.dashboard-root|\*|script|iframe)\b/i.test(selector);
    if (rootSelector) {
      warnings.push(`Selector "${selector}" will be scoped to the public portfolio root.`);
    }
    if (unsafeSelector) {
      errors.push(`Unsafe selector "${selector}". Target .pf-* portfolio classes instead.`);
    }

    const protectedSelector = /\.(pf-projects|pf-section|pf-portfolio)(?![a-z0-9_-])/.test(selector);
    const dangerousProperty = /\b(display|grid-template-columns|grid-template-rows|flex-direction|flex-wrap|overflow|float)\s*:/i.test(declarations);
    if (protectedSelector && dangerousProperty && !/:(hover|focus|active)|::/.test(selector)) {
      warnings.push(`Layout property on "${selector}" may destabilize the portfolio layout.`);
    }

    for (const declaration of declarations.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon === -1) continue;
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      if (!property || !value) continue;
      if (property === 'transition' && /\ball\b/i.test(value)) {
        warnings.push(`Avoid transition: all on "${selector}". Transition only transform, opacity, color, background-color, border-color, or box-shadow.`);
      }
      if (property === 'animation' || property === 'animation-duration') {
        const times = extractCssTimeTokens(value);
        if (times.some((time) => time > 1600)) {
          errors.push(`CSS animation on "${selector}" is too slow. Keep custom CSS animations under 1.6s or use native interaction recipes.`);
        }
        if (/\binfinite\b/i.test(value) && /\.(pf-project-card|pf-section|pf-header|pf-contact|pf-skill-tag|pf-tech-tag|pf-credential-card|pf-endorsement-card|pf-feature-card|pf-stat-card)\b/.test(selector)) {
          errors.push(`Infinite CSS animations on content selector "${selector}" are not allowed. Use gradientMesh, ambientParticles, or native hover/reveal recipes.`);
        }
      }
      if (property === 'transition' || property === 'transition-duration') {
        const times = extractCssTimeTokens(value);
        if (times.some((time) => time > 1000)) {
          errors.push(`CSS transition on "${selector}" is too slow. Keep transitions under 1s or use native interaction recipes.`);
        }
      }
    }
  }

  return { errors, warnings };
};

const validateCustomization = (result) => {
  const errors = [];
  const warnings = [];

  for (const key of Object.keys(result.themeOverrides || {})) {
    if (!VALID_THEME_KEYS.has(key)) errors.push(`Unknown theme override key "${key}".`);
  }
  for (const [key, validValues] of Object.entries(VALID_ANIMATIONS)) {
    const value = result.animations?.[key] || 'none';
    if (!validValues.has(value)) errors.push(`Invalid animation ${key}: "${value}".`);
  }

  const jsValidation = validateJs(result.js || '');
  const cssValidation = validateCss(result.css || '', result.js || '');
  errors.push(...jsValidation.errors, ...cssValidation.errors);
  warnings.push(...jsValidation.warnings, ...cssValidation.warnings);

  return { errors, warnings };
};

const normalizeComparableObject = (value) => parseJsonishObject(value);

const summarizeObjectChanges = (before = {}, after = {}) => {
  const beforeObj = normalizeComparableObject(before);
  const afterObj = normalizeComparableObject(after);
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

  return [...keys].filter((key) => {
    const beforeValue = beforeObj[key] ?? null;
    const afterValue = afterObj[key] ?? null;
    return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
  });
};

const summarizeCustomizationChanges = (current = {}, result = {}) => {
  const cssBefore = current.css || '';
  const jsBefore = current.js || '';
  const cssAfter = result.css || '';
  const jsAfter = result.js || '';
  const changedBlocks = result.changedBlocks || {};
  const themeOverrideKeys = summarizeObjectChanges(current.themeOverrides, result.themeOverrides);
  const animationKeys = summarizeObjectChanges(current.animations, result.animations);

  return {
    cssChanged: cssBefore !== cssAfter,
    jsChanged: jsBefore !== jsAfter,
    cssBlockIds: Array.isArray(changedBlocks.css) ? changedBlocks.css : [],
    jsBlockIds: Array.isArray(changedBlocks.js) ? changedBlocks.js : [],
    removedBlockIds: Array.isArray(changedBlocks.removed) ? changedBlocks.removed : [],
    themeOverrideKeys,
    animationKeys,
  };
};

module.exports = {
  DEFAULT_ANIMATIONS,
  VALID_ANIMATIONS,
  VALID_THEME_KEYS,
  extractMarkedBlocks,
  normalizeBlockId,
  parseAndMergeAiResponse,
  parseAiJson,
  summarizeCustomizationChanges,
  validateCustomization,
};
