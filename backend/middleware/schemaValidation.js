const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const byteLength = (value) => Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');

const missing = (value) => value === undefined || value === null;

const makeRule = (kind, options = {}) => ({ kind, ...options });
const asStringOptions = (rule, overrides = {}) => {
  const { kind, values, schema, itemRule, ...rest } = rule;
  return { ...rest, ...overrides };
};

const s = {
  any: (options = {}) => makeRule('any', options),
  object: (options = {}) => makeRule('object', options),
  shape: (schema, options = {}) => makeRule('shape', { schema, ...options }),
  array: (itemRule, options = {}) => makeRule('array', { itemRule, ...options }),
  string: (options = {}) => makeRule('string', options),
  email: (options = {}) => makeRule('email', options),
  url: (options = {}) => makeRule('url', options),
  uuid: (options = {}) => makeRule('uuid', options),
  boolean: (options = {}) => makeRule('boolean', options),
  integer: (options = {}) => makeRule('integer', options),
  number: (options = {}) => makeRule('number', options),
  enum: (values, options = {}) => makeRule('enum', { values, ...options }),
  date: (options = {}) => makeRule('date', options),
  hexColor: (options = {}) => makeRule('hexColor', options),
};

const typeError = (path, message) => ({ field: path, message });

const validateObjectShape = (value, schema, path, errors) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(typeError(path, 'Must be an object.'));
    return undefined;
  }

  const allowed = new Set(Object.keys(schema));
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(typeError(path ? `${path}.${key}` : key, 'Unexpected field.'));
  }

  const output = {};
  for (const [key, rule] of Object.entries(schema)) {
    const nextPath = path ? `${path}.${key}` : key;
    const parsed = validateValue(value[key], rule, nextPath, errors);
    if (parsed !== undefined || Object.prototype.hasOwnProperty.call(value, key)) output[key] = parsed;
  }
  return output;
};

const validateValue = (value, rule, path, errors) => {
  if (missing(value)) {
    if (rule.required) errors.push(typeError(path, 'Required field.'));
    return value === null && rule.allowNull ? null : undefined;
  }

  if (value === '' && !rule.required && rule.allowEmpty !== false) return '';

  switch (rule.kind) {
    case 'any': {
      if (rule.maxBytes && byteLength(value) > rule.maxBytes) errors.push(typeError(path, `Must be ${rule.maxBytes} bytes or less.`));
      return value;
    }
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push(typeError(path, 'Must be an object.'));
      if (rule.maxBytes && byteLength(value) > rule.maxBytes) errors.push(typeError(path, `Must be ${rule.maxBytes} bytes or less.`));
      return value;
    }
    case 'shape': {
      const shaped = validateObjectShape(value, rule.schema, path, errors);
      if (rule.maxBytes && byteLength(shaped) > rule.maxBytes) errors.push(typeError(path, `Must be ${rule.maxBytes} bytes or less.`));
      return shaped;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push(typeError(path, 'Must be an array.'));
        return undefined;
      }
      if (rule.max !== undefined && value.length > rule.max) errors.push(typeError(path, `Must contain ${rule.max} items or fewer.`));
      if (rule.min !== undefined && value.length < rule.min) errors.push(typeError(path, `Must contain at least ${rule.min} items.`));
      return value.map((item, index) => validateValue(item, rule.itemRule || s.any(), `${path}[${index}]`, errors));
    }
    case 'string': {
      let next = value;
      if (typeof next !== 'string') {
        if (!rule.coerce) {
          errors.push(typeError(path, 'Must be a string.'));
          return undefined;
        }
        next = String(next);
      }
      if (rule.trim !== false) next = next.trim();
      if (rule.required && next.length === 0 && rule.allowEmpty !== true) errors.push(typeError(path, 'Required field.'));
      if (rule.min !== undefined && next.length < rule.min) errors.push(typeError(path, `Must be at least ${rule.min} characters.`));
      if (rule.max !== undefined && next.length > rule.max) errors.push(typeError(path, `Must be ${rule.max} characters or fewer.`));
      if (rule.pattern && !rule.pattern.test(next)) errors.push(typeError(path, 'Invalid format.'));
      return next;
    }
    case 'email': {
      const next = validateValue(value, s.string(asStringOptions(rule, { max: rule.max || 254 })), path, errors);
      if (next && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) errors.push(typeError(path, 'Must be a valid email address.'));
      return next ? next.toLowerCase() : next;
    }
    case 'url': {
      const next = validateValue(value, s.string(asStringOptions(rule, { max: rule.max || 2048 })), path, errors);
      if (!next) return next;
      try {
        const parsed = new URL(next);
        const protocols = rule.protocols || ['http:', 'https:'];
        if (!protocols.includes(parsed.protocol)) errors.push(typeError(path, 'Must be an HTTP or HTTPS URL.'));
      } catch {
        errors.push(typeError(path, 'Must be a valid URL.'));
      }
      return next;
    }
    case 'uuid': {
      const next = validateValue(value, s.string(asStringOptions(rule, { max: 36 })), path, errors);
      if (next && !UUID_RE.test(next)) errors.push(typeError(path, 'Must be a valid UUID.'));
      return next;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (rule.coerce !== false && (value === 'true' || value === '1')) return true;
      if (rule.coerce !== false && (value === 'false' || value === '0')) return false;
      errors.push(typeError(path, 'Must be a boolean.'));
      return undefined;
    }
    case 'integer': {
      const next = typeof value === 'number' ? value : (rule.coerce !== false ? Number(value) : NaN);
      if (!Number.isSafeInteger(next)) {
        errors.push(typeError(path, 'Must be an integer.'));
        return undefined;
      }
      if (rule.min !== undefined && next < rule.min) errors.push(typeError(path, `Must be at least ${rule.min}.`));
      if (rule.max !== undefined && next > rule.max) errors.push(typeError(path, `Must be ${rule.max} or less.`));
      return next;
    }
    case 'number': {
      const next = typeof value === 'number' ? value : (rule.coerce !== false ? Number(value) : NaN);
      if (!Number.isFinite(next)) {
        errors.push(typeError(path, 'Must be a number.'));
        return undefined;
      }
      if (rule.min !== undefined && next < rule.min) errors.push(typeError(path, `Must be at least ${rule.min}.`));
      if (rule.max !== undefined && next > rule.max) errors.push(typeError(path, `Must be ${rule.max} or less.`));
      return next;
    }
    case 'enum': {
      if (!rule.values.includes(value)) errors.push(typeError(path, `Must be one of: ${rule.values.join(', ')}.`));
      return value;
    }
    case 'date': {
      const next = validateValue(value, s.string(asStringOptions(rule, { max: 10 })), path, errors);
      if (next && !DATE_RE.test(next)) errors.push(typeError(path, 'Must be a YYYY-MM-DD date.'));
      return next;
    }
    case 'hexColor': {
      const next = validateValue(value, s.string(asStringOptions(rule, { max: 16 })), path, errors);
      if (next && !HEX_COLOR_RE.test(next)) errors.push(typeError(path, 'Must be a hex color.'));
      return next;
    }
    default:
      errors.push(typeError(path, 'Unknown validation rule.'));
      return undefined;
  }
};

const validateLocation = (source, schema, locationName, rejectUnknown, errors) => {
  if (!schema) return source;
  const value = source || {};
  const allowed = new Set(Object.keys(schema));
  if (rejectUnknown) {
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) errors.push(typeError(key, `Unexpected ${locationName} field.`));
    }
  }
  const output = {};
  for (const [key, rule] of Object.entries(schema)) {
    const parsed = validateValue(value[key], rule, key, errors);
    if (parsed !== undefined || Object.prototype.hasOwnProperty.call(value, key)) output[key] = parsed;
  }
  return output;
};

const validateSchema = (schemas, options = {}) => {
  const rejectUnknownBody = options.rejectUnknownBody !== false;
  const rejectUnknownQuery = options.rejectUnknownQuery === true;
  const rejectUnknownParams = options.rejectUnknownParams === true;

  return (req, res, next) => {
    const errors = [];
    if (schemas.body) req.body = validateLocation(req.body, schemas.body, 'body', rejectUnknownBody, errors);
    if (schemas.query) req.query = validateLocation(req.query, schemas.query, 'query', rejectUnknownQuery, errors);
    if (schemas.params) req.params = validateLocation(req.params, schemas.params, 'route parameter', rejectUnknownParams, errors);

    if (errors.length) {
      return res.status(400).json({
        error: 'Invalid request payload.',
        code: 'VALIDATION_FAILED',
        details: errors.slice(0, 20),
      });
    }
    return next();
  };
};

module.exports = { validateSchema, s, UUID_RE };
