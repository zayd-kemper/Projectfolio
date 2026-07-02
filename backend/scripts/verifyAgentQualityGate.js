#!/usr/bin/env node

require('dotenv').config();

const { spawnSync } = require('child_process');
const path = require('path');
const { preflightLiveRoutes } = require('../utils/agentBrowserVerifier');

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

const run = (label, command, args, options = {}) => {
  console.log(`\n[agent-quality] ${label}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || path.resolve(__dirname, '..'),
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
  }
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

const buildLiveArgs = (args, username) => {
  const liveArgs = ['scripts/verifyAgentLiveRoutes.js', '--username', username];
  const project = args.project || process.env.AGENT_VERIFY_PROJECT;
  const frontend = args.frontend || process.env.FRONTEND_URL;
  const backend = args.backend || process.env.AGENT_VERIFY_BACKEND;
  const screenshots = args.screenshots || process.env.AGENT_BROWSER_ARTIFACT_DIR;
  const timeout = args.timeout || process.env.AGENT_VERIFY_TIMEOUT || '20000';
  if (project) liveArgs.push('--project', project);
  if (frontend) liveArgs.push('--frontend', frontend);
  if (backend) liveArgs.push('--backend', backend);
  if (screenshots) liveArgs.push('--screenshots', screenshots);
  if (timeout) liveArgs.push('--timeout', timeout);
  liveArgs.push('--skip-preflight');
  return liveArgs;
};

const runEarlyLivePreflight = async (args, username) => {
  if (!username || args['skip-preflight']) return null;
  console.log('\n[agent-quality] Live route dependency preflight');
  const result = await preflightLiveRoutes({
    username,
    projectSlug: args.project || process.env.AGENT_VERIFY_PROJECT,
    frontendUrl: args.frontend || process.env.FRONTEND_URL || 'http://localhost:3000',
    backendUrl: args.backend || process.env.AGENT_VERIFY_BACKEND || 'http://localhost:5000',
    timeoutMs: Math.min(Number(args.timeout || process.env.AGENT_VERIFY_TIMEOUT || 5000), 5000),
  });
  summarizePreflight(result);
  if (result.status === 'failed') {
    throw new Error('Live route dependency preflight failed. Fix the frontend/backend/API route before running Chromium browser checks.');
  }
  return result;
};

const printUsage = () => {
  console.log([
    'Usage:',
    '  npm run verify:agent-quality -- [--username <username>] [--project <slug>] [--frontend http://localhost:3000] [--backend http://localhost:5000] [--screenshots <dir>]',
    '',
    'What it checks:',
    '  1. Backend syntax for agent/browser verifier files.',
    '  2. Fast backend unit tests.',
    '  3. Optional live-route dependency preflight when --username is provided.',
    '  4. Browser verifier harness tests.',
    '  5. Optional real frontend live-route browser check when --username is provided.',
    '',
    'Examples:',
    '  npm run verify:agent-quality',
    '  npm run verify:agent-quality -- --username mike --project mart --frontend http://localhost:3000 --screenshots ./agent-browser-artifacts',
  ].join('\n'));
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  const username = args.username || process.env.AGENT_VERIFY_USERNAME;

  run('Syntax check agent files', 'node', [
    '--check',
    'routes/agent.js',
  ]);
  run('Syntax check browser verifier', 'node', [
    '--check',
    'utils/agentBrowserVerifier.js',
  ]);
  run('Syntax check site agent', 'node', [
    '--check',
    'utils/siteAgent.js',
  ]);
  run('Backend fast agent tests', 'npm', ['test']);
  await runEarlyLivePreflight(args, username);
  run('Backend browser verifier tests', 'npm', ['run', 'test:agent-browser']);

  if (username) {
    run('Live frontend route browser check', 'node', buildLiveArgs(args, username));
  } else {
    console.log('\n[agent-quality] Live frontend route browser check skipped. Pass --username or set AGENT_VERIFY_USERNAME to include it.');
  }

  console.log('\n[agent-quality] Agent browser reliability gate passed.');
};

try {
  main().catch((error) => {
    console.error(`\n[agent-quality] ${error.message}`);
    process.exit(1);
  });
} catch (error) {
  console.error(`\n[agent-quality] ${error.message}`);
  process.exit(1);
}
