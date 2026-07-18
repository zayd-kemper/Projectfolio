const test = require('node:test');
const assert = require('node:assert/strict');
const safeFetch = require('../utils/safeFetch');
const { findProjectTutorials } = require('../advisor/resourceFinder');

test('findProjectTutorials fails soft when the lookup APIs are down', async () => {
  safeFetch.safeFetchText = async () => { throw new Error('network down'); };
  assert.deepEqual(await findProjectTutorials({ keywords: ['robot'], technologies: ['ROS 2'] }), []);

  safeFetch.safeFetchText = async () => ({ ok: true, status: 200, text: 'not json at all' });
  assert.deepEqual(await findProjectTutorials({ keywords: ['robot'], technologies: ['ROS 2'] }), []);

  assert.deepEqual(await findProjectTutorials({ keywords: [], technologies: [] }), [], 'no query means no lookups');
});

test('findSkillResources returns free learning resources in the package resource shape', async () => {
  const { findSkillResources } = require('../advisor/resourceFinder');
  safeFetch.safeFetchText = async (url) => {
    if (url.includes('api.github.com/search/repositories')) {
      return {
        ok: true,
        status: 200,
        text: JSON.stringify({
          items: [
            { full_name: 'sindresorhus/awesome-nodejs', html_url: 'https://github.com/sindresorhus/awesome-nodejs', description: 'Delightful Node.js packages and resources', stargazers_count: 50000 },
          ],
        }),
      };
    }
    if (url.includes('dev.to/api/articles')) {
      return {
        ok: true,
        status: 200,
        text: JSON.stringify([{ title: 'Learning Node.js in 2026', url: 'https://dev.to/user/learning-nodejs' }]),
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const resources = await findSkillResources({ name: 'Node.js backend development', keywords: ['node'] });
  assert.ok(resources.length >= 1 && resources.length <= 3);
  for (const resource of resources) {
    assert.ok(resource.name, 'resource has a name');
    assert.ok(['course', 'docs', 'book', 'platform'].includes(resource.type), `valid type ${resource.type}`);
    assert.ok(resource.provider, 'resource has a provider');
    assert.match(resource.url, /^https:\/\//);
  }
});

test('findProjectTutorials drops dev.to articles unrelated to the search terms', async () => {
  safeFetch.safeFetchText = async (url) => {
    if (url.includes('api.github.com')) return { ok: true, status: 200, text: JSON.stringify({ items: [] }) };
    if (url.includes('dev.to/api/articles')) {
      return {
        ok: true,
        status: 200,
        text: JSON.stringify([
          { title: '"Why Learn C" Book Announcement', url: 'https://dev.to/user/why-learn-c' },
          { title: 'Writing a Linux kernel driver for a sensor', url: 'https://dev.to/user/linux-kernel-sensor-driver' },
        ]),
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const tutorials = await findProjectTutorials({
    keywords: ['embedded linux sensor driver'],
    technologies: ['Linux Kernel', 'ROS 2'],
    limit: 3,
  });

  const urls = tutorials.map((tutorial) => tutorial.url);
  assert.ok(!urls.includes('https://dev.to/user/why-learn-c'), 'off-topic article is dropped');
  assert.ok(urls.includes('https://dev.to/user/linux-kernel-sensor-driver'), 'on-topic article survives');
});

test('findSkillResources drops off-topic dev.to articles too', async () => {
  const { findSkillResources } = require('../advisor/resourceFinder');
  safeFetch.safeFetchText = async (url) => {
    if (url.includes('api.github.com')) return { ok: true, status: 200, text: JSON.stringify({ items: [] }) };
    if (url.includes('dev.to/api/articles')) {
      return {
        ok: true,
        status: 200,
        text: JSON.stringify([
          { title: 'Mastering Advanced CSS Grid Layouts', url: 'https://dev.to/user/css-grid' },
          { title: 'Oscilloscope probing for bench instrumentation', url: 'https://dev.to/user/oscilloscope-bench' },
        ]),
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const resources = await findSkillResources({ name: 'Advanced bench instrumentation', keywords: ['oscilloscope'] });
  const urls = resources.map((resource) => resource.url);
  assert.ok(!urls.includes('https://dev.to/user/css-grid'), 'off-topic article is dropped');
  assert.ok(urls.includes('https://dev.to/user/oscilloscope-bench'), 'on-topic article survives');
});

test('findProjectTutorials retries GitHub without the tutorial suffix when the narrow query is empty', async () => {
  const githubQueries = [];
  safeFetch.safeFetchText = async (url) => {
    if (url.includes('api.github.com')) {
      const query = decodeURIComponent(url.match(/[?&]q=([^&]+)/)[1]);
      githubQueries.push(query);
      if (/tutorial/.test(query)) return { ok: true, status: 200, text: JSON.stringify({ items: [] }) };
      return {
        ok: true,
        status: 200,
        text: JSON.stringify({
          items: [{ full_name: 'ros2/ros2', html_url: 'https://github.com/ros2/ros2', description: 'ROS 2 core', stargazers_count: 4000 }],
        }),
      };
    }
    if (url.includes('dev.to/api/articles')) return { ok: true, status: 200, text: JSON.stringify([]) };
    throw new Error(`unexpected fetch ${url}`);
  };

  const tutorials = await findProjectTutorials({ keywords: ['ROS 2 telemetry framework'], technologies: ['ROS 2'], limit: 3 });
  assert.equal(githubQueries.length, 2, 'narrow query then broad retry');
  assert.ok(tutorials.some((tutorial) => tutorial.url === 'https://github.com/ros2/ros2'));
});

test('findProjectTutorials rejects dev.to articles sharing only one generic token', async () => {
  safeFetch.safeFetchText = async (url) => {
    if (url.includes('api.github.com')) return { ok: true, status: 200, text: JSON.stringify({ items: [] }) };
    if (url.includes('dev.to/api/articles')) {
      return {
        ok: true,
        status: 200,
        text: JSON.stringify([
          // Shares only "linux" with the search terms — topical noise.
          { title: 'Linux Without Fanboyism: An Honest Take', url: 'https://dev.to/user/linux-fanboyism' },
        ]),
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const tutorials = await findProjectTutorials({
    keywords: ['embedded linux CAN bus driver'],
    technologies: ['Linux', 'CAN'],
    limit: 3,
  });
  assert.deepEqual(tutorials, [], 'one shared token is not relevance');
});

test('verifyUrlAlive reports liveness and never throws', async () => {
  const { verifyUrlAlive } = require('../advisor/resourceFinder');

  safeFetch.safeFetchText = async () => ({ ok: true, status: 200, text: 'hello' });
  assert.equal(await verifyUrlAlive('https://example.com/tutorial'), true);

  safeFetch.safeFetchText = async () => ({ ok: false, status: 404, text: '' });
  assert.equal(await verifyUrlAlive('https://example.com/gone'), false);

  safeFetch.safeFetchText = async () => { throw new Error('timeout'); };
  assert.equal(await verifyUrlAlive('https://example.com/slow'), false);
});

test('findProjectTutorials returns real GitHub and dev.to results mapped to the tutorial shape', async () => {
  const requested = [];
  safeFetch.safeFetchText = async (url) => {
    requested.push(url);
    if (url.startsWith('https://api.github.com/search/repositories')) {
      return {
        ok: true,
        status: 200,
        text: JSON.stringify({
          items: [
            { full_name: 'PX4/PX4-Autopilot', html_url: 'https://github.com/PX4/PX4-Autopilot', description: 'PX4 Autopilot Software', stargazers_count: 8000 },
            { full_name: 'foo/dup', html_url: 'https://github.com/PX4/PX4-Autopilot', description: 'duplicate url', stargazers_count: 10 },
          ],
        }),
      };
    }
    if (url.startsWith('https://dev.to/api/articles')) {
      return {
        ok: true,
        status: 200,
        text: JSON.stringify([
          { title: 'Precision landing with PX4', url: 'https://dev.to/user/precision-landing' },
        ]),
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const tutorials = await findProjectTutorials({ keywords: ['drone landing'], technologies: ['PX4', 'OpenCV'], limit: 3 });

  assert.ok(tutorials.length >= 2 && tutorials.length <= 3, `got ${tutorials.length}`);
  const urls = tutorials.map((tutorial) => tutorial.url);
  assert.equal(new Set(urls).size, urls.length, 'results are deduplicated by url');
  assert.ok(tutorials.some((tutorial) => tutorial.source === 'github' && tutorial.url === 'https://github.com/PX4/PX4-Autopilot'));
  assert.ok(tutorials.some((tutorial) => tutorial.source === 'devto'));
  assert.ok(tutorials.every((tutorial) => tutorial.title && /^https:\/\//.test(tutorial.url)));
  assert.ok(requested.some((url) => url.includes('api.github.com/search/repositories')));
});
