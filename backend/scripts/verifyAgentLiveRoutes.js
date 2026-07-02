#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { preflightLiveRoutes, verifyLiveRoutes } = require('../utils/agentBrowserVerifier');

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
};

const readJsonFile = (filePath) => {
  if (!filePath) return null;
  const absolute = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
};

const printUsage = () => {
  console.log([
    'Usage:',
    '  npm run verify:agent-live -- --username <username> [--project <slug>] [--frontend http://localhost:3000] [--backend http://localhost:5000] [--screenshots <dir>]',
    '',
    'Optional dashboard auth:',
    '  --include-dashboard --token <jwt> --user-json <path-to-user-json>',
    '',
    'Examples:',
    '  npm run verify:agent-live -- --username zayd --project my-project',
    '  npm run verify:agent-live -- --username zayd --frontend http://localhost:3000',
    '  npm run verify:agent-live -- --username zayd --skip-preflight',
  ].join('\n'));
};

const summarize = (result) => {
  console.log(`Agent live route verification: ${result.status}`);
  for (const check of result.checks || []) {
    const screenshot = check.screenshot
      ? `, screenshot ${check.screenshot.likelyNonBlank ? 'nonblank' : 'unclear'} (${Math.round((check.screenshot.bytes || 0) / 1024)} KB${check.screenshot.path ? `, ${check.screenshot.path}` : ''})`
      : '';
    console.log(`- ${check.page}/${check.viewport}: ${check.status}${check.url ? ` ${check.url}` : ''}${screenshot}`);
    if (check.status === 'failed' && check.bodyTextPreview) {
      console.log(`  text: ${check.bodyTextPreview}`);
    }
    for (const issue of check.networkIssues || []) {
      console.log(`  network: ${issue}`);
    }
  }
  for (const warning of result.warnings || []) console.warn(`Warning: ${warning}`);
  for (const error of result.errors || []) console.error(`Error: ${error}`);
};

const summarizePreflight = (result) => {
  console.log(`Agent live route preflight: ${result.status}`);
  for (const check of result.checks || []) {
    console.log(`- ${check.name}: ${check.ok ? 'passed' : 'failed'} ${check.url}${check.status ? ` (${check.status})` : ''}`);
    if (!check.ok && check.bodyPreview) console.log(`  response: ${check.bodyPreview}`);
  }
  for (const warning of result.warnings || []) console.warn(`Warning: ${warning}`);
  for (const error of result.errors || []) console.error(`Error: ${error}`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.username) {
    printUsage();
    process.exit(args.help ? 0 : 2);
  }

  const user = readJsonFile(args['user-json']);
  const auth = args.token && user ? { token: args.token, user } : null;
  const frontendUrl = args.frontend || process.env.FRONTEND_URL || 'http://localhost:3000';
  const backendUrl = args.backend || process.env.AGENT_VERIFY_BACKEND || 'http://localhost:5000';
  const timeoutMs = args.timeout ? Number(args.timeout) : 15000;

  if (!args['skip-preflight']) {
    const preflight = await preflightLiveRoutes({
      username: args.username,
      projectSlug: args.project,
      frontendUrl,
      backendUrl,
      timeoutMs: Math.min(timeoutMs, 5000),
    });
    summarizePreflight(preflight);
    if (args.json) console.log(JSON.stringify({ preflight }, null, 2));
    if (preflight.status === 'failed') {
      console.error('Agent live route verification stopped before Chromium because required services or API routes are not healthy.');
      process.exit(1);
    }
  }

  const result = await verifyLiveRoutes({
    username: args.username,
    projectSlug: args.project,
    frontendUrl,
    auth,
  }, {
    timeoutMs,
    includeDashboard: args['include-dashboard'] === true,
    screenshotDir: args.screenshots,
  });

  summarize(result);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'failed' ? 1 : 0);
};

main().catch((error) => {
  console.error(`Agent live route verification crashed: ${error.message}`);
  process.exit(1);
});
