import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

function exists(root, relative) {
  return fs.existsSync(path.join(root, relative));
}

function readText(root, relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8');
}

function readJson(root, relative) {
  const text = readText(root, relative);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return { ok: false, output: (result.stderr || result.stdout || '').trim() };
  return { ok: true, output: (result.stdout || '').trim() };
}

export function discover(root) {
  const verified = [];
  const inferred = [];
  const unknown = [];
  const conflicts = [];

  const packageJson = readJson(root, 'package.json');
  const pyproject = readText(root, 'pyproject.toml');
  const goMod = exists(root, 'go.mod');
  const cargo = exists(root, 'Cargo.toml');
  const gemfile = exists(root, 'Gemfile');

  const lockNpm = exists(root, 'package-lock.json');
  const lockPnpm = exists(root, 'pnpm-lock.yaml');
  const lockYarn = exists(root, 'yarn.lock');
  const lockPoetry = exists(root, 'poetry.lock');
  const lockUv = exists(root, 'uv.lock');

  if (packageJson?.name) {
    verified.push({ key: 'project.name', value: packageJson.name, evidence: 'package.json name' });
  } else if (pyproject || goMod || cargo) {
    unknown.push({ key: 'project.name', reason: 'no package.json name and no safe name parser for other manifests' });
  } else {
    unknown.push({ key: 'project.name', reason: 'no recognized project manifest' });
  }

  const nodeLocks = [
    lockNpm ? 'npm' : null,
    lockPnpm ? 'pnpm' : null,
    lockYarn ? 'yarn' : null,
  ].filter(Boolean);
  if (nodeLocks.length > 1) {
    conflicts.push({
      key: 'packageManager',
      evidence: nodeLocks.join(', '),
      reason: 'more than one Node lockfile',
    });
  } else if (nodeLocks.length === 1) {
    verified.push({ key: 'packageManager', value: nodeLocks[0], evidence: nodeLocks[0] + ' lockfile' });
  } else if (lockPoetry) {
    verified.push({ key: 'packageManager', value: 'poetry', evidence: 'poetry.lock' });
  } else if (lockUv) {
    verified.push({ key: 'packageManager', value: 'uv', evidence: 'uv.lock' });
  } else if (pyproject) {
    unknown.push({ key: 'packageManager', reason: 'pyproject.toml without a lockfile' });
  } else if (goMod) {
    verified.push({ key: 'packageManager', value: 'go', evidence: 'go.mod' });
  } else if (cargo) {
    verified.push({ key: 'packageManager', value: 'cargo', evidence: 'Cargo.toml' });
  } else if (gemfile) {
    verified.push({ key: 'packageManager', value: 'bundler', evidence: 'Gemfile' });
  } else {
    unknown.push({ key: 'packageManager', reason: 'no lockfile or language manifest' });
  }

  const frameworks = [];
  if (packageJson?.dependencies?.['@angular/core'] || packageJson?.devDependencies?.['@angular/core'] || exists(root, 'angular.json')) {
    frameworks.push('angular');
  }
  if (packageJson?.dependencies?.react || packageJson?.devDependencies?.react) frameworks.push('react');
  if (frameworks.length > 0) {
    verified.push({ key: 'frameworks', value: frameworks, evidence: 'manifest or framework config file' });
  } else if (pyproject) {
    inferred.push({ key: 'languages', value: ['python'], evidence: 'pyproject.toml exists; interpreter version was not executed' });
  } else {
    unknown.push({ key: 'frameworks', reason: 'no recognized framework manifest' });
  }

  const readme = readText(root, 'README.md') + '\n' + readText(root, 'AGENTS.md');
  const trackerLine = readme.match(/issue tracker:\s*([A-Za-z0-9_-]+)/i);
  if (trackerLine) {
    inferred.push({
      key: 'tickets.provider',
      value: trackerLine[1].toLowerCase(),
      evidence: 'README or AGENTS.md line. Not written into the profile automatically.',
    });
  } else {
    unknown.push({
      key: 'tickets.provider',
      reason: 'no issue-tracker declaration. Branch names and ticket-like strings are not treated as evidence.',
    });
  }

  const managerLine = readme.match(/package manager:\s*([A-Za-z0-9_-]+)/i);
  const verifiedManager = verified.find((item) => item.key === 'packageManager');
  if (managerLine && verifiedManager && managerLine[1].toLowerCase() !== verifiedManager.value) {
    conflicts.push({
      key: 'packageManager',
      profileInstruction: managerLine[1].toLowerCase(),
      discovery: verifiedManager.value,
      reason: 'README package manager disagrees with the lockfile',
    });
  }

  if (!exists(root, 'ai/project/profile.json')) {
    unknown.push({ key: 'projectProfile', reason: 'ai/project/profile.json is missing' });
  }
  if (!exists(root, 'AGENTS.md') && !exists(root, 'ai/README.md')) {
    unknown.push({ key: 'agentInstructions', reason: 'AGENTS.md and ai/README.md are both missing' });
  }

  const scripts = packageJson?.scripts ?? {};
  const runner = verified.find((item) => item.key === 'packageManager')?.value;
  if (runner === 'npm' || runner === 'pnpm' || runner === 'yarn') {
    for (const name of ['test', 'lint', 'build', 'start']) {
      if (scripts[name]) {
        verified.push({
          key: 'commands.' + name,
          value: runner + ' run ' + name,
          evidence: 'package.json scripts.' + name + ' with ' + runner + ' lockfile',
        });
      }
    }
  } else if (packageJson && !runner) {
    unknown.push({ key: 'commands', reason: 'package.json scripts exist but the package manager lockfile is missing or conflicting' });
  }
  if (!packageJson && !pyproject) {
    unknown.push({ key: 'commands', reason: 'no package.json scripts or pyproject.toml commands were parsed' });
  }

  const branch = git(root, ['branch', '--show-current']);
  const status = git(root, ['status', '--short']);
  const remote = git(root, ['remote', '-v']);
  const gitFacts = {
    available: branch.ok,
    currentBranch: branch.ok ? branch.output : null,
    statusShort: status.ok ? status.output : null,
    remotes: remote.ok ? remote.output : null,
  };
  if (!branch.ok) unknown.push({ key: 'git', reason: branch.output || 'git command failed' });

  return {
    verified,
    inferred,
    unknown,
    conflicts,
    git: gitFacts,
    notes: [
      'Discovery does not activate technology profiles.',
      'Discovery does not set tickets.required.',
      'Discovery does not choose a commit convention or a base branch.',
      'Discovery does not execute project scripts.',
    ],
  };
}

function main() {
  const rootFlag = process.argv.indexOf('--root');
  const root = rootFlag >= 0 ? path.resolve(process.argv[rootFlag + 1]) : process.cwd();
  const report = discover(root);
  const writeFlag = process.argv.indexOf('--write-draft');
  if (writeFlag >= 0) {
    const destination = path.resolve(process.argv[writeFlag + 1] ?? path.join(root, 'ai', 'project', 'discovery-report.json'));
    if (fs.existsSync(destination)) {
      console.error('discovery draft already exists and was not overwritten: ' + destination);
      process.exit(2);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv.includes('--cli')) main();
