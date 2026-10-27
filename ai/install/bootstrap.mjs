import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const portablePaths = [
  'ai/CORE_VERSION',
  'ai/README.md',
  'ai/validate.mjs',
  'ai/portability-self-test.mjs',
  'ai/core',
  'ai/agents',
  'ai/adapters',
  'ai/profiles',
  'ai/discovery',
  'ai/install',
  'ai/lib',
  'ai/rules',
  'ai/workflows',
  'ai/templates',
  'ai/project/SCHEMA.md',
  'AGENTS.md',
  'rules/ticket-branch.md',
  '.codex/agents',
];

const excluded = new Set([
  'ai/project/profile.json',
  'ai/project/profile.md',
  'ai/project/discovery-report.json',
  'ai/install/conflict-report.json',
]);

const cursorTemplates = [
  ['ai/templates/cursor/rules/project-context.mdc', '.cursor/rules/project-context.mdc', null],
  ['ai/templates/cursor/rules/jira-and-branch-workflow.mdc', '.cursor/rules/jira-and-branch-workflow.mdc', null],
  ['ai/templates/cursor/rules/git-and-delivery.mdc', '.cursor/rules/git-and-delivery.mdc', null],
  ['ai/templates/cursor/rules/minimal-implementation.mdc', '.cursor/rules/minimal-implementation.mdc', null],
  ['ai/templates/cursor/rules/multi-agent-development-workflow.mdc', '.cursor/rules/multi-agent-development-workflow.mdc', null],
  ['ai/templates/cursor/rules/testing-and-quality.mdc', '.cursor/rules/testing-and-quality.mdc', null],
  ['ai/templates/cursor/rules/angular-typescript.mdc', '.cursor/rules/angular-typescript.mdc', 'angular-typescript'],
  ['ai/templates/cursor/rules/ui-html.mdc', '.cursor/rules/ui-html.mdc', 'angular-html'],
  ['ai/templates/cursor/rules/ui-scss.mdc', '.cursor/rules/ui-scss.mdc', 'angular-scss'],
  ['ai/templates/cursor/agents/implementer.md', '.cursor/agents/implementer.md', null],
  ['ai/templates/cursor/agents/code-reviewer.md', '.cursor/agents/code-reviewer.md', null],
  ['ai/templates/cursor/agents/test-engineer.md', '.cursor/agents/test-engineer.md', null],
];

function readActiveProfiles(targetRoot) {
  const profilePath = path.join(targetRoot, 'ai', 'project', 'profile.json');
  if (!fs.existsSync(profilePath)) return new Set();
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    return new Set((profile.activeProfiles ?? []).map((id) => String(id)));
  } catch {
    return new Set();
  }
}

function isMacMetadata(relative) {
  const base = path.basename(String(relative).replace(/\\/g, '/'));
  return base === '.DS_Store' || base.startsWith('._') || base === '.AppleDouble';
}

function isKitOwnedPath(normalized) {
  if (
    excluded.has(normalized) ||
    normalized.startsWith('ai/project/profile') ||
    normalized.endsWith('discovery-report.json') ||
    normalized.endsWith('conflict-report.json') ||
    normalized === 'AGENTS.md' ||
    normalized === '.cursor' ||
    normalized.startsWith('.cursor/')
  ) {
    return false;
  }
  if (normalized === 'ai/project/SCHEMA.md') return true;
  if (normalized.startsWith('ai/project/')) return false;
  if (normalized === 'ai' || normalized.startsWith('ai/')) return true;
  if (normalized === 'rules/ticket-branch.md') return true;
  if (normalized === '.codex/agents' || normalized.startsWith('.codex/agents/')) return true;
  return false;
}

function copyEntry(sourceRoot, targetRoot, relative, conflicts, updated, update) {
  if (excluded.has(relative.replace(/\\/g, '/'))) return;
  if (isMacMetadata(relative)) return;
  const from = path.join(sourceRoot, relative);
  const to = path.join(targetRoot, relative);
  if (!fs.existsSync(from)) return;
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(from)) {
      copyEntry(sourceRoot, targetRoot, path.join(relative, entry), conflicts, updated, update);
    }
    return;
  }
  const normalized = relative.replace(/\\/g, '/');
  if (
    excluded.has(normalized) ||
    normalized.startsWith('ai/project/profile') ||
    normalized.endsWith('discovery-report.json') ||
    normalized.endsWith('conflict-report.json')
  ) {
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (!fs.existsSync(to)) {
    fs.copyFileSync(from, to);
    return;
  }
  const current = fs.readFileSync(to);
  const incoming = fs.readFileSync(from);
  if (current.equals(incoming)) return;
  if (update && isKitOwnedPath(normalized)) {
    fs.copyFileSync(from, to);
    updated.push(normalized);
    return;
  }
  conflicts.push(normalized);
}

function collectObsolete(sourceRoot, targetRoot) {
  const obsolete = [];
  for (const relative of portablePaths) {
    if (relative === 'AGENTS.md') continue;
    collectObsoleteEntry(sourceRoot, targetRoot, relative, obsolete);
  }
  return obsolete;
}

function collectObsoleteEntry(sourceRoot, targetRoot, relative, obsolete) {
  const to = path.join(targetRoot, relative);
  if (!fs.existsSync(to) || isMacMetadata(relative)) return;
  const stat = fs.statSync(to);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(to)) {
      collectObsoleteEntry(sourceRoot, targetRoot, path.join(relative, entry), obsolete);
    }
    return;
  }
  const normalized = relative.replace(/\\/g, '/');
  if (!isKitOwnedPath(normalized)) return;
  if (!fs.existsSync(path.join(sourceRoot, normalized))) obsolete.push(normalized);
}

function materializeCursorAdapters(sourceRoot, targetRoot, conflicts, activeProfiles) {
  const copiedAngularProfiles = [];
  for (const [fromRel, toRel, requiredProfile] of cursorTemplates) {
    if (requiredProfile && !activeProfiles.has(requiredProfile)) continue;
    const from = path.join(sourceRoot, fromRel);
    if (!fs.existsSync(from)) {
      throw new Error('missing cursor template ' + fromRel);
    }
    const to = path.join(targetRoot, toRel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (requiredProfile) copiedAngularProfiles.push(requiredProfile);
    if (!fs.existsSync(to)) {
      fs.copyFileSync(from, to);
      continue;
    }
    const current = fs.readFileSync(to);
    const incoming = fs.readFileSync(from);
    if (current.equals(incoming)) continue;
    conflicts.push(toRel);
  }
  return copiedAngularProfiles;
}

export function detectTargetBaseBranch(root) {
  const symbolic = spawnSync('git', ['-C', root, 'symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], {
    encoding: 'utf8',
  });
  if (symbolic.error || symbolic.status !== 0) return 'unknown';
  const ref = String(symbolic.stdout || '').trim();
  const prefix = 'refs/remotes/origin/';
  if (!ref.startsWith(prefix)) return 'unknown';
  const name = ref.slice(prefix.length);
  if (!name || name === 'HEAD') return 'unknown';
  const format = spawnSync('git', ['check-ref-format', '--branch', name], { encoding: 'utf8' });
  if (format.error || format.status !== 0) return 'unknown';
  return name;
}

export function skeletonProfile(version, base = 'unknown') {
  return {
    coreVersion: version,
    project: { name: 'unknown', type: 'unknown' },
    packageManager: 'unknown',
    tickets: { provider: 'unknown', required: 'unknown' },
    commits: {
      convention: 'unknown',
      ticketRequired: 'unknown',
      headerPattern: '',
      bodyRequired: true,
      types: [],
    },
    branch: { base },
    commands: {},
    activeProfiles: [],
  };
}

export const installerProfileDoc =
  '# Project profile\n\nMachine-readable values are in `ai/project/profile.json`.\n\nFill this file from a reviewed discovery report. Leave unknown facts unknown.\n';

function readKitVersion(sourceRoot, errors) {
  const pkgPath = path.join(sourceRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const version = String(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? '').trim();
      if (version) return version;
    } catch (error) {
      errors.push({
        path: 'package.json',
        message: 'unable to read package.json version: ' + String(error.message ?? error),
      });
    }
  }
  try {
    const version = fs.readFileSync(path.join(sourceRoot, 'ai', 'CORE_VERSION'), 'utf8').trim();
    if (!version) {
      errors.push({ path: 'ai/CORE_VERSION', message: 'ai/CORE_VERSION is missing or empty' });
      return null;
    }
    return version;
  } catch (error) {
    errors.push({
      path: 'ai/CORE_VERSION',
      message: 'unable to read ai/CORE_VERSION: ' + String(error.message ?? error),
    });
    return null;
  }
}

export function install({ sourceRoot, targetRoot, update = false } = {}) {
  const conflicts = [];
  const errors = [];
  const updated = [];
  const activeProfiles = readActiveProfiles(targetRoot);
  let copiedAngularProfiles = [];
  for (const relative of portablePaths) {
    try {
      copyEntry(sourceRoot, targetRoot, relative, conflicts, updated, update);
    } catch (error) {
      errors.push({ path: relative.replace(/\\/g, '/'), message: String(error.message ?? error) });
    }
  }
  try {
    copiedAngularProfiles = materializeCursorAdapters(sourceRoot, targetRoot, conflicts, activeProfiles);
  } catch (error) {
    errors.push({ path: '.cursor', message: String(error.message ?? error) });
  }
  const version = readKitVersion(sourceRoot, errors);
  const profilePath = path.join(targetRoot, 'ai', 'project', 'profile.json');
  const profileDocPath = path.join(targetRoot, 'ai', 'project', 'profile.md');
  const branchBase = detectTargetBaseBranch(targetRoot);
  let profileAction = 'left-existing';
  if (version && !fs.existsSync(profilePath)) {
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    fs.writeFileSync(profilePath, JSON.stringify(skeletonProfile(version, branchBase), null, 2) + '\n');
    profileAction = 'created-unknowns';
  } else if (fs.existsSync(profilePath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      let changed = false;
      if (version && branchBase !== 'unknown' && existing?.branch?.base === 'unknown') {
        existing.branch.base = branchBase;
        changed = true;
        profileAction = 'refreshed-base';
      }
      if (update && version && errors.length === 0 && conflicts.length === 0 && existing.coreVersion !== version) {
        existing.coreVersion = version;
        changed = true;
        if (profileAction === 'left-existing') profileAction = 'refreshed-version';
      }
      if (changed) fs.writeFileSync(profilePath, JSON.stringify(existing, null, 2) + '\n');
    } catch {
      // leave a malformed profile unchanged
    }
  }
  if (!fs.existsSync(profileDocPath)) {
    fs.mkdirSync(path.dirname(profileDocPath), { recursive: true });
    fs.writeFileSync(profileDocPath, installerProfileDoc);
  }
  const reportPath = path.join(targetRoot, 'ai', 'install', 'conflict-report.json');
  const report = {
    coreVersion: version,
    conflicts,
    errors,
    updated,
    obsolete: collectObsolete(sourceRoot, targetRoot),
    profileAction,
    branchBase,
    overwritten: [],
    rollback: false,
    angularCursorRulesCopied: copiedAngularProfiles,
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  return report;
}

const guardCommand = 'node ai/install/task-branch-guard.mjs';

function ensureHook(hooks, event, entry) {
  const list = Array.isArray(hooks[event]) ? hooks[event] : [];
  const index = list.findIndex((item) => item && item.command === entry.command);
  if (index < 0) {
    list.push(entry);
    hooks[event] = list;
    return true;
  }
  const current = list[index];
  const matcherMatches = entry.matcher ? current.matcher === entry.matcher : true;
  if (current.failClosed === true && matcherMatches) return false;
  list[index] = { ...current, ...entry };
  hooks[event] = list;
  return true;
}

function materializeCursorHook(root) {
  const guardPath = path.join(root, 'ai', 'install', 'task-branch-guard.mjs');
  if (!fs.existsSync(guardPath)) {
    throw new Error('missing ai/install/task-branch-guard.mjs');
  }
  const hooksPath = path.join(root, '.cursor', 'hooks.json');
  let config = { version: 1, hooks: {} };
  if (fs.existsSync(hooksPath)) {
    config = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('invalid .cursor/hooks.json');
    }
  }
  if (!config.hooks || typeof config.hooks !== 'object' || Array.isArray(config.hooks)) {
    config.hooks = {};
  }
  if (!config.version) config.version = 1;
  const changed = [
    ensureHook(config.hooks, 'preToolUse', {
      command: guardCommand,
      matcher: 'Write|StrReplace|Delete|EditNotebook|ApplyPatch|Edit',
      failClosed: true,
    }),
    ensureHook(config.hooks, 'beforeShellExecution', {
      command: guardCommand,
      failClosed: true,
    }),
  ].some(Boolean);
  if (!fs.existsSync(hooksPath) || changed) {
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2) + '\n');
  }
  return { changed };
}

function main() {
  const update = process.argv.includes('--update');
  const targetFlag = process.argv.indexOf('--target');
  const hasTarget = targetFlag >= 0 && Boolean(process.argv[targetFlag + 1]);
  if (update && !hasTarget) {
    console.error('Usage: node ai/install/bootstrap.mjs --target <repository> --update');
    process.exit(1);
  }
  if (process.argv.includes('--materialize-cursor')) {
    const root = hasTarget ? path.resolve(process.argv[targetFlag + 1]) : process.cwd();
    try {
      console.log(JSON.stringify({ materializeCursor: true, ...materializeCursorHook(root) }));
    } catch (error) {
      console.error(error.message ?? error);
      process.exit(1);
    }
    return;
  }
  if (!hasTarget) {
    console.error('Usage: node ai/install/bootstrap.mjs --target <repository>');
    console.error('       node ai/install/bootstrap.mjs --target <repository> --update');
    console.error('       node ai/install/bootstrap.mjs --materialize-cursor');
    process.exit(1);
  }
  const sourceFlag = process.argv.indexOf('--source');
  const sourceRoot = sourceFlag >= 0 ? path.resolve(process.argv[sourceFlag + 1]) : process.cwd();
  const targetRoot = path.resolve(process.argv[targetFlag + 1]);
  if (path.resolve(sourceRoot) === targetRoot) {
    console.error('Refusing to install onto the source repository.');
    process.exit(1);
  }
  const report = install({ sourceRoot, targetRoot, update });
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length > 0) {
    for (const error of report.errors) {
      console.error('Bootstrap failed (exit 4): ' + error.path + ': ' + error.message);
    }
    if (report.updated.length > 0) {
      console.error(
        'Kit-owned files in updated were already replaced. There is no rollback. Retrying --update is safe for user-owned files.'
      );
    }
    process.exit(4);
  }
  if (report.conflicts.length > 0) {
    console.error(
      'Bootstrap left conflicting files unchanged (exit 3): ' +
        report.conflicts.join(', ') +
        '. Merge them manually. Bootstrap never overwrites or auto-merges user-owned files.'
    );
    if (report.updated.length > 0) {
      console.error(
        'Kit-owned files in updated were already replaced. There is no rollback. Retrying --update is safe for user-owned files.'
      );
    }
    if (report.conflicts.includes('AGENTS.md')) {
      console.error(
        'AGENTS.md conflict: merge the existing file so it still points at `ai/README.md`, `ai/core/lifecycle.md`, and Single-agent fallback. `node ai/validate.mjs` cannot pass until that merge is done.'
      );
    }
    process.exit(3);
  }
}

if (
  process.argv.includes('--target') ||
  process.argv.includes('--update') ||
  process.argv.includes('--materialize-cursor')
) {
  main();
}
