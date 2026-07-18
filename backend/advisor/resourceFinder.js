// Live tutorial/resource lookup for AI-suggested projects and skills.
// Uses only free, keyless public APIs (GitHub search, dev.to articles), so
// every returned URL is real by construction — the model never invents links.
// All lookups fail soft: an outage degrades to the curated fallback path.

const safeFetch = require('../utils/safeFetch');
const { compactText } = require('../utils/portfolioAiContext');

const asArray = (value) => (Array.isArray(value) ? value : []);

const fetchJson = async (url) => {
  const response = await safeFetch.safeFetchText(url, { maxBytes: 512 * 1024, timeoutMs: 8000 });
  if (!response.ok) return null;
  try {
    return JSON.parse(response.text);
  } catch {
    return null;
  }
};

const searchGithubTutorials = async (query, limit) => {
  const data = await fetchJson(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`
  );
  return asArray(data?.items)
    .filter((item) => /^https:\/\/github\.com\//.test(String(item.html_url || '')))
    .map((item) => ({
      title: compactText(item.description ? `${item.full_name}: ${item.description}` : item.full_name, 160),
      source: 'github',
      url: item.html_url,
    }));
};

// dev.to tags are lowercase alphanumerics (react, ros2, machinelearning).
const toDevtoTag = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const searchDevtoTutorials = async (tag, limit) => {
  if (!tag) return [];
  const data = await fetchJson(`https://dev.to/api/articles?per_page=${limit}&tag=${encodeURIComponent(tag)}&top=365`);
  return asArray(data)
    .filter((article) => /^https:\/\/dev\.to\//.test(String(article.url || '')))
    .map((article) => ({
      title: compactText(article.title, 160),
      source: 'devto',
      url: article.url,
    }));
};

const dedupeByUrl = (tutorials) => {
  const seen = new Set();
  return tutorials.filter((tutorial) => {
    if (seen.has(tutorial.url)) return false;
    seen.add(tutorial.url);
    return true;
  });
};

// Tokens worth matching on: lowercase, length >= 3, no stopwords.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'your', 'from', 'into', 'that',
  // generic learning adjectives that match everything and mean nothing
  'advanced', 'beginner', 'intermediate', 'mastering', 'complete', 'ultimate',
  'guide', 'learn', 'learning', 'introduction', 'basics', 'development',
]);
const meaningfulTokens = (values) => new Set(
  values
    .flatMap((value) => String(value || '').toLowerCase().split(/[^a-z0-9+]+/))
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
);

// dev.to tag feeds are noisy — keep an article only when its title shares at
// least two real tokens with the search terms; a single shared word ("linux",
// "spice") is coincidence, not relevance.
const isRelevant = (title, tokens) => {
  let shared = 0;
  for (const token of meaningfulTokens([title])) {
    if (tokens.has(token)) shared += 1;
    if (shared >= 2) return true;
  }
  return false;
};

const findProjectTutorials = async ({ keywords = [], technologies = [], limit = 3 } = {}) => {
  const query = [...keywords, ...technologies].filter(Boolean).slice(0, 4).join(' ');
  if (!query) return [];
  const tokens = meaningfulTokens([...keywords, ...technologies]);
  const tag = toDevtoTag(technologies[0] || keywords[0]);
  // GitHub search ANDs every term — "X tutorial" often matches nothing, so
  // retry the bare query before giving up.
  const githubLookup = async () => {
    const narrow = await searchGithubTutorials(`${query} tutorial`, Math.max(1, limit - 1));
    if (narrow.length) return narrow;
    return searchGithubTutorials(query, Math.max(1, limit - 1));
  };
  const [github, devto] = await Promise.all([
    githubLookup().catch(() => []),
    searchDevtoTutorials(tag, 3).catch(() => []),
  ]);
  const relevantDevto = devto.filter((article) => isRelevant(article.title, tokens)).slice(0, 1);
  return dedupeByUrl([...github, ...relevantDevto]).slice(0, limit);
};

// Learning resources for a skill: curated "awesome" lists on GitHub plus
// recent dev.to articles, mapped to the package's resource shape.
const findSkillResources = async ({ name = '', keywords = [] } = {}) => {
  const query = [name, ...keywords].filter(Boolean).slice(0, 3).join(' ');
  if (!query.trim()) return [];
  const tokens = meaningfulTokens([name, ...keywords]);
  const tag = toDevtoTag(keywords[0] || name.split(/\s+/)[0]);
  const [github, devto] = await Promise.all([
    searchGithubTutorials(`awesome ${query}`, 2).catch(() => []),
    searchDevtoTutorials(tag, 3).catch(() => []),
  ]);
  const relevantDevto = devto.filter((article) => isRelevant(article.title, tokens)).slice(0, 1);
  return dedupeByUrl([...github, ...relevantDevto]).slice(0, 3).map((result) => ({
    name: result.title,
    type: result.source === 'devto' ? 'platform' : 'docs',
    provider: result.source === 'devto' ? 'dev.to' : 'GitHub',
    url: result.url,
  }));
};

// Liveness check for AI-supplied URLs — a dead link is worse than no link.
const verifyUrlAlive = async (url) => {
  try {
    const response = await safeFetch.safeFetchText(url, { maxBytes: 64 * 1024, timeoutMs: 6000 });
    return response.ok === true;
  } catch {
    return false;
  }
};

module.exports = { findProjectTutorials, findSkillResources, verifyUrlAlive };
