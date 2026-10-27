import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { discover } from './discovery/discover.mjs';
import { generateProfile } from './discovery/generate-profile.mjs';
import { install } from './install/bootstrap.mjs';
import {
  adapterStatesApprovalHardLock,
  classifyCheck,
  compareProfileToDiscovery,
  interpretCommitApproval,
  reviewProposal,
  shouldPrepareCommitProposal,
  validateCommitMessage,
} from './lib/policy.mjs';
import {
  analyzePastedStory,
  claimedGitSucceeded,
  classifyStoryInput,
  coreFallbackBranchName,
  planBranchPreparation,
  reconcileBaseDiscovery,
  resolveBaseBranch,
  resolveBranchName,
  storyAllowsWorkflow,
  validateBranchNameWithGit,
  verifyConfiguredBase,
} from './lib/task-input.mjs';

function write(root, relative, contents) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

const jiraProfile = {
  commits: {
    headerPattern: '^([a-z]+)\\(([^(),\\n]+), ([a-z][a-z0-9]*-\\d+)\\)(!)?: (\\S.*)$',
    ticketRequired: true,
    bodyRequired: true,
    types: ['feat', 'fix', 'docs', 'test', 'refactor', 'perf', 'build', 'ci', 'style', 'chore', 'revert'],
  },
};

const linearProfile = {
  commits: {
    headerPattern: '^([a-z]+)\\(([^(),\\n]+), (lin-\\d+)\\)(!)?: (\\S.*)$',
    ticketRequired: true,
    bodyRequired: true,
    types: ['feat', 'fix', 'docs'],
  },
};

const noTicketProfile = {
  commits: {
    headerPattern: '^([a-z]+)\\(([^(),\\n]+)\\)(!)?: (\\S.*)$',
    ticketRequired: false,
    bodyRequired: true,
    types: ['docs', 'fix'],
  },
};

export function runPortabilitySelfTest(sourceRoot) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-portability-'));
  let failed = false;

  function check(name, actual, expected) {
    const passed = actual === expected;
    console.log('PORTABILITY', name, 'EXPECTED=' + expected, 'ACTUAL=' + actual, passed ? 'PASS' : 'FAIL');
    if (!passed) failed = true;
  }

  try {
    const angularRoot = path.join(parent, 'angular-jira');
    write(
      angularRoot,
      'package.json',
      JSON.stringify({
        name: 'sample-web',
        dependencies: { '@angular/core': '17.3.0' },
        scripts: { test: 'jest', lint: 'ng lint', build: 'ng build', start: 'ng serve' },
      })
    );
    write(angularRoot, 'package-lock.json', '{}\n');
    write(angularRoot, 'angular.json', '{}\n');
    write(angularRoot, 'README.md', '# Sample\n\nNo tracker is declared here.\n');
    const angularReport = discover(angularRoot);
    const angularFrameworks = angularReport.verified.find((item) => item.key === 'frameworks');
    const angularManager = angularReport.verified.find((item) => item.key === 'packageManager');
    check(
      'jira-angular-repo-detects-angular-and-npm',
      Boolean(angularFrameworks?.value?.includes('angular') && angularManager?.value === 'npm'),
      true
    );
    check(
      'jira-angular-repo-does-not-infer-jira',
      angularReport.verified.some((item) => item.key === 'tickets.provider') ||
        angularReport.inferred.some((item) => item.value === 'jira'),
      false
    );
    check('story-url-mode', classifyStoryInput({ url: 'https://example.test/browse/TKT-10' }).mode, 'url');
    check('story-id-mode', classifyStoryInput({ ticketId: 'tkt-10' }).mode, 'id');
    const pastedComplete =
      'As a user I must see the save button enabled after valid input.\n\nAcceptance criteria:\n- The save button is enabled when the form is valid.';
    check('pasted-story-mode', classifyStoryInput({ pastedText: pastedComplete }).mode, 'pasted');
    check('pasted-story-allows-workflow', storyAllowsWorkflow({ pastedText: pastedComplete }, jiraProfile).ok, true);
    check(
      'pasted-story-does-not-require-ticket',
      storyAllowsWorkflow({ pastedText: pastedComplete }, { tickets: { required: true, provider: 'jira' } }).ok,
      true
    );
    const incompleteStory = 'Please fix the form.';
    check('ambiguous-story-asks', analyzePastedStory(incompleteStory).ask, true);
    check('ambiguous-story-does-not-invent-ac', analyzePastedStory(incompleteStory).inventedAcceptance, false);

    const configuredHyphenProfile = {
      project: { name: 'sample-web' },
      branch: {
        base: 'dev',
        feature: 'feat/<project-name>-<ticket-id>-<short-kebab-summary>',
        ticketlessFeature: 'feat/<project-name>-<short-kebab-summary>',
      },
    };
    check(
      'configured-ticketed-convention-accepted',
      resolveBranchName({
        profile: configuredHyphenProfile,
        ticketId: 'tkt-10',
        taskType: 'feature',
        summary: 'save button state',
      }).name,
      'feat/sample-web-tkt-10-save-button-state'
    );
    check(
      'configured-hyphen-ticketless-convention-accepted',
      resolveBranchName({
        profile: configuredHyphenProfile,
        ticketId: null,
        taskType: 'feature',
        summary: 'save button state',
      }).name,
      'feat/sample-web-save-button-state'
    );
    const canonicalFallback = coreFallbackBranchName({
      projectName: 'sample-web',
      ticketId: null,
      kind: 'feature',
      summary: 'save button state',
    });
    check('canonical-ticketless-feature-fallback', canonicalFallback.name, 'feat/sample-web/save-button-state');
    check(
      'canonical-ticketless-fallback-rejects-hyphen',
      canonicalFallback.name === 'feat/sample-web-save-button-state',
      false
    );
    check(
      'canonical-ticketless-fallback-rejects-bare-slug',
      canonicalFallback.name === 'feat/save-button-state',
      false
    );
    check(
      'canonical-ticketless-bug-fallback',
      coreFallbackBranchName({
        projectName: 'inventory-api',
        ticketId: null,
        kind: 'bug',
        summary: 'empty file validation',
      }).name,
      'fix/inventory-api/empty-file-validation'
    );
    check(
      'missing-project-name-stays-unresolved',
      coreFallbackBranchName({ projectName: 'unknown', ticketId: null, kind: 'feature', summary: 'save button state' })
        .reason,
      'unknown-project-name'
    );
    check(
      'missing-project-name-does-not-invent-task',
      coreFallbackBranchName({ projectName: null, ticketId: null, kind: 'feature', summary: 'save button state' })
        .name ?? '',
      ''
    );
    const sampleTicketless = {
      project: { name: 'sample-app' },
      tickets: { idPattern: '^tkt-\\d+$' },
      branch: {
        base: 'dev',
        feature: 'feat/tkt-<number>/<short-kebab-summary>',
        bug: 'fix/tkt-<number>/<short-kebab-summary>',
        ticketlessFeature: 'feat/sample-app/<short-kebab-summary>',
        ticketlessBug: 'fix/sample-app/<short-kebab-summary>',
      },
    };
    check(
      'sample-ticketless-feature-template',
      resolveBranchName({ profile: sampleTicketless, ticketId: null, taskType: 'feature', summary: 'dynamic theme' })
        .name,
      'feat/sample-app/dynamic-theme'
    );
    check(
      'sample-ticketless-bug-template',
      resolveBranchName({ profile: sampleTicketless, ticketId: null, taskType: 'bug', summary: 'empty file validation' })
        .name,
      'fix/sample-app/empty-file-validation'
    );
    check(
      'sample-ticketed-template-accepted',
      resolveBranchName({ profile: sampleTicketless, ticketId: 'tkt-10', taskType: 'feature', summary: 'dynamic theme' })
        .name,
      'feat/tkt-10/dynamic-theme'
    );
    check(
      'fabricated-ticket-id-rejected',
      resolveBranchName({
        profile: sampleTicketless,
        ticketId: 'made-up-1',
        taskType: 'feature',
        summary: 'dynamic theme',
      }).reason,
      'unverified-ticket-id'
    );
    check(
      'core-fallback-when-no-template',
      resolveBranchName({
        profile: { project: { name: 'customer-portal' }, branch: { base: 'main' } },
        ticketId: null,
        taskType: 'feature',
        summary: 'export reports',
      }).name,
      'feat/customer-portal/export-reports'
    );
    check('base-configured-dev', resolveBaseBranch({ branch: { base: 'dev' } }).name, 'dev');
    check('base-configured-develop', resolveBaseBranch({ branch: { base: 'develop' } }).name, 'develop');
    check('base-configured-main', resolveBaseBranch({ branch: { base: 'main' } }).name, 'main');
    check('base-unknown-asks', resolveBaseBranch({ branch: { base: 'unknown' } }).reason, 'unknown-base');
    check('base-missing-asks', resolveBaseBranch({ branch: {} }).reason, 'missing-base');
    check('base-missing-has-no-fallback-name', resolveBaseBranch({ branch: {} }).name ?? null, null);
    check('base-invalid-ref-rejected', resolveBaseBranch({ branch: { base: 'dev..x' } }).reason, 'invalid-ref');
    check(
      'unavailable-base-is-not-verified',
      verifyConfiguredBase({ configured: 'develop', localBranches: ['dev'], remoteBranches: [] }).verified,
      false
    );
    check(
      'available-base-is-verified',
      verifyConfiguredBase({ configured: 'dev', localBranches: ['dev'], remoteBranches: ['origin/develop'] }).verified,
      true
    );
    const unresolvedBase = reconcileBaseDiscovery({ configured: 'dev', discovered: 'develop' });
    check('discovery-conflict-keeps-configured-base', unresolvedBase.keep, 'dev');
    check('discovery-conflict-does-not-overwrite-base', unresolvedBase.overwrite, false);
    check('discovery-conflict-is-reported', unresolvedBase.conflict, true);
    const acceptedRef = validateBranchNameWithGit('feat/sample-app/dynamic-theme');
    check('git-accepts-path-segment-branch', acceptedRef.checked && acceptedRef.valid, true);
    for (const [label, sample] of [
      ['git-rejects-double-dot', 'feat/foo..bar'],
      ['git-rejects-at-brace', 'feat/foo@{bar'],
      ['git-rejects-lock-suffix', 'feat/name.lock'],
      ['git-rejects-space', 'feat/has space'],
      ['git-rejects-tilde', 'feat/has~tilde'],
      ['git-rejects-empty-segment', 'feat//double'],
    ]) {
      const ref = validateBranchNameWithGit(sample);
      check(label, ref.checked && ref.valid === false, true);
    }
    check(
      'invalid-ref-blocks-preparation',
      planBranchPreparation({
        currentBranch: 'dev',
        statusShort: '',
        intendedName: 'feat/foo..bar',
        localBranches: [],
        base: 'dev',
      }).reason,
      'invalid-ref'
    );
    check(
      'no-tracker-branch-without-invented-id',
      resolveBranchName({
        profile: {
          project: { name: 'lib' },
          branch: { base: 'main', ticketlessFeature: 'feat/<short-kebab-summary>' },
          tickets: { provider: 'none' },
        },
        ticketId: null,
        taskType: 'feature',
        summary: 'add cache',
      }).name.includes('vdx'),
      false
    );

    check(
      'resume-existing-task-branch',
      planBranchPreparation({
        currentBranch: 'dev',
        statusShort: '',
        intendedName: 'feat/save-button-state',
        localBranches: ['feat/save-button-state'],
        remoteBranches: [],
        base: 'dev',
        existingBelongsToTask: true,
      }).action,
      'resume-existing'
    );
    check(
      'unrelated-dirty-tree-asks',
      planBranchPreparation({
        currentBranch: 'feat/other-work',
        statusShort: ' M src/app.ts',
        intendedName: 'feat/save-button-state',
        localBranches: [],
        base: 'dev',
        dirtyUnrelated: true,
      }).action,
      'ask'
    );
    check(
      'branch-name-collision-asks',
      planBranchPreparation({
        currentBranch: 'dev',
        statusShort: '',
        intendedName: 'feat/save-button-state',
        localBranches: ['feat/save-button-state'],
        base: 'dev',
        existingBelongsToTask: false,
      }).reason,
      'branch-name-collision'
    );
    check(
      'unknown-base-asks',
      planBranchPreparation({
        currentBranch: 'feature-x',
        statusShort: '',
        intendedName: 'feat/save-button-state',
        localBranches: [],
        base: 'unknown',
      }).reason,
      'unknown-base'
    );
    check(
      'unverified-git-claim-rejected',
      claimedGitSucceeded({
        commandRan: true,
        exitCode: 0,
        verifiedBranch: 'dev',
        expectedBranch: 'feat/save-button-state',
      }),
      false
    );
    check(
      'verified-git-claim-accepted',
      claimedGitSucceeded({
        commandRan: true,
        exitCode: 0,
        verifiedBranch: 'feat/save-button-state',
        expectedBranch: 'feat/save-button-state',
      }),
      true
    );

    check(
      'jira-profile-accepts-its-ticket-header',
      validateCommitMessage('fix(form, tkt-10): tighten validation\n\nExplain the form change.\n', jiraProfile)
        .length === 0,
      true
    );
    check(
      'jira-profile-ticketless-fallback',
      validateCommitMessage('fix(form): tighten validation\n\nExplain the form change.\n', jiraProfile, {
        hasTicket: false,
      }).length === 0,
      true
    );

    check(
      'other-tracker-accepts-its-id',
      validateCommitMessage('fix(form, lin-10): tighten validation\n\nExplain the form change.\n', linearProfile)
        .length === 0,
      true
    );
    check(
      'other-tracker-rejects-unrelated-prefix',
      validateCommitMessage('fix(form, tkt-10): tighten validation\n\nExplain the form change.\n', linearProfile)
        .length > 0,
      true
    );

    check(
      'no-tracker-accepts-header-without-ticket',
      validateCommitMessage('docs(readme): document setup\n\nDocument the setup.\n', noTicketProfile).length === 0,
      true
    );
    check(
      'no-tracker-rejects-invented-ticket-header',
      validateCommitMessage('docs(readme, tkt-10): document setup\n\nDocument the setup.\n', noTicketProfile).length >
        0,
      true
    );

    const pythonRoot = path.join(parent, 'python-poetry');
    write(pythonRoot, 'pyproject.toml', '[tool.poetry]\nname = "sample"\n');
    write(pythonRoot, 'poetry.lock', '# lock\n');
    write(pythonRoot, 'README.md', '# Sample\n');
    const pythonReport = discover(pythonRoot);
    check(
      'python-poetry-manager',
      pythonReport.verified.find((item) => item.key === 'packageManager')?.value ?? '',
      'poetry'
    );
    check(
      'python-repo-does-not-emit-npm-commands',
      pythonReport.verified.some((item) => String(item.value).startsWith('npm ')),
      false
    );
    check(
      'python-repo-does-not-infer-angular',
      pythonReport.verified.some((item) => item.key === 'frameworks' && item.value.includes('angular')),
      false
    );

    check(
      'pre-existing-file-blocks-proposal',
      reviewProposal({
        groupFiles: ['src/app.ts', 'notes.md'],
        taskOwned: ['src/app.ts'],
        preExisting: ['notes.md'],
      }).accept,
      false
    );

    const conflictRoot = path.join(parent, 'conflict-instructions');
    write(conflictRoot, 'package.json', JSON.stringify({ name: 'conflict', scripts: { test: 'jest' } }));
    write(conflictRoot, 'package-lock.json', '{}\n');
    write(conflictRoot, 'README.md', 'Package manager: pnpm\n');
    const conflictReport = discover(conflictRoot);
    check(
      'conflicting-readme-and-lockfile',
      conflictReport.conflicts.some((item) => item.key === 'packageManager'),
      true
    );
    write(conflictRoot, 'README.md', '# Missing agent instructions\n');
    fs.rmSync(path.join(conflictRoot, 'AGENTS.md'), { force: true });
    const missingInstructions = discover(conflictRoot);
    check(
      'missing-agent-instructions-stay-unknown',
      missingInstructions.unknown.some((item) => item.key === 'agentInstructions'),
      true
    );

    const cursorAdapter = fs.readFileSync(path.join(sourceRoot, 'ai', 'adapters', 'cursor.md'), 'utf8');
    check('adapter-documents-missing-hard-lock', adapterStatesApprovalHardLock(cursorAdapter), true);
    check(
      'adapter-false-guarantee-is-not-a-hard-lock',
      adapterStatesApprovalHardLock('This tool automatically guarantees approval before staging.'),
      false
    );

    const oneGroup = interpretCommitApproval('Approve g1 only.', ['g1', 'g2']);
    check('approve-one-group', oneGroup.approved.join(','), 'g1');
    check('unapproved-group-excluded', oneGroup.approved.includes('g2'), false);

    check(
      'explicit-no-commit-skips-proposal',
      shouldPrepareCommitProposal('Please implement this and do not commit.'),
      false
    );
    check('explicit-no-commit-approves-nothing', interpretCommitApproval('do not commit', ['g1', 'g2']).action, 'skip');

    check(
      'unrelated-preexisting-file',
      reviewProposal({
        groupFiles: ['src/owned.ts', 'src/user-notes.ts'],
        taskOwned: ['src/owned.ts'],
        preExisting: ['src/user-notes.ts'],
      }).blocked.join(','),
      'src/user-notes.ts'
    );

    check(
      'unknown-command-is-not-passed',
      classifyCheck({ applicable: true, commandKnown: false, toolAvailable: true, executed: false }).passed,
      false
    );
    check(
      'unavailable-tool-is-not-passed',
      classifyCheck({ applicable: true, commandKnown: true, toolAvailable: false, executed: false }).status,
      'BLOCKED'
    );
    check(
      'inactive-stack-check-is-not-applicable',
      classifyCheck({ applicable: false, reason: 'python profile is not active' }).status,
      'NOT APPLICABLE'
    );

    const drifted = compareProfileToDiscovery(
      { packageManager: 'poetry', tickets: { provider: 'linear' } },
      { verified: [{ key: 'packageManager', value: 'npm' }] }
    );
    check('profile-discovery-conflict', drifted.conflicts.length > 0, true);
    check('profile-discovery-conflict-does-not-overwrite', drifted.autoOverwrite, false);

    const conflicted = path.join(parent, 'conflicted-install');
    fs.mkdirSync(conflicted);
    write(conflicted, 'AGENTS.md', '# User instructions\nDo not replace this file.\n');
    const first = install({ sourceRoot, targetRoot: conflicted });
    check('bootstrap-preserves-different-agents-file', first.conflicts.includes('AGENTS.md'), true);
    check(
      'bootstrap-does-not-overwrite-user-file',
      fs.readFileSync(path.join(conflicted, 'AGENTS.md'), 'utf8').includes('Do not replace this file.'),
      true
    );

    const installed = path.join(parent, 'installed');
    fs.mkdirSync(installed);
    write(installed, 'README.md', '# Existing\n');
    write(installed, 'src/main.ts', 'export const value = 1;\n');
    write(installed, 'package.json', '{"name":"plain-ts"}\n');
    const clean = install({ sourceRoot, targetRoot: installed });
    check('clean-bootstrap-has-no-conflicts', clean.conflicts.length, 0);
    const installedProfile = JSON.parse(fs.readFileSync(path.join(installed, 'ai', 'project', 'profile.json'), 'utf8'));
    check('bootstrap-writes-unknown-profile', installedProfile.tickets.provider, 'unknown');
    check('bootstrap-does-not-copy-source-base', installedProfile.branch.base, 'unknown');
    check('bootstrap-does-not-copy-source-name', installedProfile.project.name, 'unknown');
    check('no-angular-profiles-report', JSON.stringify(clean.angularCursorRulesCopied), '[]');
    check(
      'no-angular-profiles-omits-typescript-rule',
      fs.existsSync(path.join(installed, '.cursor', 'rules', 'angular-typescript.mdc')),
      false
    );
    check(
      'no-angular-profiles-omits-html-rule',
      fs.existsSync(path.join(installed, '.cursor', 'rules', 'ui-html.mdc')),
      false
    );
    check(
      'no-angular-profiles-omits-scss-rule',
      fs.existsSync(path.join(installed, '.cursor', 'rules', 'ui-scss.mdc')),
      false
    );
    check(
      'non-angular-target-keeps-generic-cursor-rule',
      fs.existsSync(path.join(installed, '.cursor', 'rules', 'git-and-delivery.mdc')),
      true
    );
    check(
      'non-angular-target-keeps-minimal-implementation-cursor-rule',
      fs.existsSync(path.join(installed, '.cursor', 'rules', 'minimal-implementation.mdc')),
      true
    );
    const repeated = install({ sourceRoot, targetRoot: installed });
    const repeatedProfile = JSON.parse(fs.readFileSync(path.join(installed, 'ai', 'project', 'profile.json'), 'utf8'));
    check('repeated-install-has-no-new-conflicts', repeated.conflicts.length, 0);
    check('repeated-install-has-no-copy-errors', repeated.errors.length, 0);
    check('repeated-install-keeps-unknown-base', repeatedProfile.branch.base, 'unknown');
    check('repeated-install-leaves-existing-profile', repeated.profileAction, 'left-existing');
    const installedDiscovery = discover(installed);
    check(
      'installed-tree-does-not-infer-jira-or-angular',
      installedDiscovery.verified.some((item) => item.key === 'tickets.provider' || item.key === 'frameworks'),
      false
    );
    const validation = spawnSync(process.execPath, [path.join('ai', 'validate.mjs')], {
      cwd: installed,
      encoding: 'utf8',
    });
    check('installed-tree-structure-validation', validation.status ?? 1, 0);
    if ((validation.status ?? 1) !== 0) {
      const relevant = (validation.stdout + validation.stderr)
        .split(/\r?\n/)
        .filter((line) => line.startsWith('FAIL '))
        .slice(0, 8);
      for (const line of relevant) console.log('  ' + line);
    }

    const cliTarget = path.join(parent, 'cli-target');
    fs.mkdirSync(cliTarget);
    const cliRun = spawnSync(process.execPath, [path.join(sourceRoot, 'ai', 'install', 'cli.mjs'), '--target', cliTarget], {
      encoding: 'utf8',
    });
    check('cli-install-exit', cliRun.status ?? 1, 0);
    check(
      'cli-install-creates-profile',
      fs.existsSync(path.join(cliTarget, 'ai', 'project', 'profile.json')),
      true
    );
    const cliUsage = spawnSync(process.execPath, [path.join(sourceRoot, 'ai', 'install', 'cli.mjs')], {
      encoding: 'utf8',
    });
    check('cli-usage-exit', cliUsage.status ?? 0, 1);
    const cliSourceRejected = spawnSync(
      process.execPath,
      [path.join(sourceRoot, 'ai', 'install', 'cli.mjs'), '--source', sourceRoot, '--target', cliTarget],
      { encoding: 'utf8' }
    );
    check('cli-rejects-source-flag', cliSourceRejected.status ?? 0, 1);

    const nodeProfileRoot = path.join(parent, 'node-profile');
    write(
      nodeProfileRoot,
      'package.json',
      JSON.stringify({ name: 'plain-node', scripts: { test: 'node --test' } }) + '\n'
    );
    write(nodeProfileRoot, 'package-lock.json', '{}\n');
    install({ sourceRoot, targetRoot: nodeProfileRoot });
    const generatedNode = generateProfile({ root: nodeProfileRoot });
    check('generate-node-exit', generatedNode.exit, 0);
    check('generate-node-wrote', generatedNode.wrote, true);
    check('generate-node-name', generatedNode.profile.project.name, 'plain-node');
    check('generate-node-manager', generatedNode.profile.packageManager, 'npm');
    check('generate-node-command', generatedNode.profile.commands.test, 'npm run test');
    check('generate-node-branch-unknown', generatedNode.profile.branch.base, 'unknown');
    check('generate-node-tickets-unknown', generatedNode.profile.tickets.provider, 'unknown');
    check('generate-node-active-empty', JSON.stringify(generatedNode.profile.activeProfiles), '[]');
    check(
      'generate-node-proposed-node',
      generatedNode.proposedProfiles.some((item) => item.id === 'node'),
      true
    );
    check(
      'generate-node-writes-markdown',
      fs.readFileSync(path.join(nodeProfileRoot, 'ai', 'project', 'profile.md'), 'utf8').includes(
        'generated from repository evidence'
      ),
      true
    );

    const edited = JSON.parse(fs.readFileSync(path.join(nodeProfileRoot, 'ai', 'project', 'profile.json'), 'utf8'));
    edited.branch.base = 'dev';
    fs.writeFileSync(path.join(nodeProfileRoot, 'ai', 'project', 'profile.json'), JSON.stringify(edited, null, 2) + '\n');
    const refused = generateProfile({ root: nodeProfileRoot });
    check('generate-refuses-edited', refused.exit, 2);
    check('generate-refuses-wrote', refused.wrote, false);
    check(
      'generate-keeps-edit',
      JSON.parse(fs.readFileSync(path.join(nodeProfileRoot, 'ai', 'project', 'profile.json'), 'utf8')).branch.base,
      'dev'
    );
    const overwritten = generateProfile({ root: nodeProfileRoot, overwrite: true });
    check('generate-overwrite-exit', overwritten.exit, 0);
    check('generate-overwrite-restores-unknown-base', overwritten.profile.branch.base, 'unknown');

    const angularProfileRoot = path.join(parent, 'angular-profile');
    write(
      angularProfileRoot,
      'package.json',
      JSON.stringify({
        name: 'sample-angular',
        dependencies: { '@angular/core': '17.3.0' },
        scripts: { test: 'ng test', lint: 'ng lint' },
      }) + '\n'
    );
    write(angularProfileRoot, 'package-lock.json', '{}\n');
    write(angularProfileRoot, 'angular.json', '{}\n');
    install({ sourceRoot, targetRoot: angularProfileRoot });
    const generatedAngular = generateProfile({ root: angularProfileRoot });
    check('generate-angular-exit', generatedAngular.exit, 0);
    check('generate-angular-frameworks', JSON.stringify(generatedAngular.profile.frameworks), '["angular"]');
    check('generate-angular-active-empty', JSON.stringify(generatedAngular.profile.activeProfiles), '[]');
    check(
      'generate-angular-proposed-ts',
      generatedAngular.proposedProfiles.some((item) => item.id === 'angular-typescript'),
      true
    );
    check(
      'generate-angular-does-not-propose-node',
      generatedAngular.proposedProfiles.some((item) => item.id === 'node'),
      false
    );

    const ambiguousRoot = path.join(parent, 'ambiguous-profile');
    write(ambiguousRoot, 'package.json', JSON.stringify({ name: 'no-lock' }) + '\n');
    install({ sourceRoot, targetRoot: ambiguousRoot });
    const generatedAmbiguous = generateProfile({ root: ambiguousRoot });
    check('generate-ambiguous-exit', generatedAmbiguous.exit, 0);
    check('generate-ambiguous-manager', generatedAmbiguous.profile.packageManager, 'unknown');
    check('generate-ambiguous-commands', JSON.stringify(generatedAmbiguous.profile.commands), '{}');
    check('generate-ambiguous-active-empty', JSON.stringify(generatedAmbiguous.profile.activeProfiles), '[]');

    const previewRoot = path.join(parent, 'preview-profile');
    write(previewRoot, 'package.json', JSON.stringify({ name: 'preview-app' }) + '\n');
    write(previewRoot, 'package-lock.json', '{}\n');
    install({ sourceRoot, targetRoot: previewRoot });
    const previewed = generateProfile({ root: previewRoot, preview: true });
    check('generate-preview-exit', previewed.exit, 0);
    check('generate-preview-wrote', previewed.wrote, false);
    check(
      'generate-preview-leaves-stub',
      JSON.parse(fs.readFileSync(path.join(previewRoot, 'ai', 'project', 'profile.json'), 'utf8')).project.name,
      'unknown'
    );
    const previewCli = spawnSync(
      process.execPath,
      [path.join(sourceRoot, 'ai', 'discovery', 'generate-profile.mjs'), '--root', previewRoot, '--preview'],
      { encoding: 'utf8' }
    );
    check('generate-preview-cli-exit', previewCli.status ?? 1, 0);

    const outsideCwd = path.join(parent, 'outside-cwd');
    fs.mkdirSync(outsideCwd);
    write(outsideCwd, 'README.md', 'not a kit\n');
    const absValidation = spawnSync(process.execPath, [path.join(installed, 'ai', 'validate.mjs')], {
      cwd: outsideCwd,
      encoding: 'utf8',
    });
    check('validate-absolute-path-from-outside-cwd', absValidation.status ?? 1, 0);
    if ((absValidation.status ?? 1) !== 0) {
      const relevant = (absValidation.stdout + absValidation.stderr)
        .split(/\r?\n/)
        .filter((line) => line.startsWith('FAIL '))
        .slice(0, 8);
      for (const line of relevant) console.log('  ' + line);
    }
    const kitFromOutside = spawnSync(process.execPath, [path.join(sourceRoot, 'ai', 'validate.mjs')], {
      cwd: outsideCwd,
      encoding: 'utf8',
    });
    check('kit-source-validate-from-outside-cwd', kitFromOutside.status ?? 1, 0);
    check(
      'kit-source-mode-from-outside-cwd',
      (kitFromOutside.stdout + kitFromOutside.stderr).includes('KIT SOURCE MODE'),
      true
    );
    const explicitRoot = spawnSync(
      process.execPath,
      [path.join(sourceRoot, 'ai', 'validate.mjs'), '--root', installed],
      { cwd: outsideCwd, encoding: 'utf8' }
    );
    check('validate-explicit-root', explicitRoot.status ?? 1, 0);
    const wrongRoot = spawnSync(
      process.execPath,
      [path.join(sourceRoot, 'ai', 'validate.mjs'), '--root', outsideCwd],
      { cwd: sourceRoot, encoding: 'utf8' }
    );
    check('validate-explicit-root-selects-target', (wrongRoot.status ?? 0) !== 0, true);

    const angularTarget = path.join(parent, 'angular-ts-html');
    fs.mkdirSync(angularTarget);
    write(
      angularTarget,
      'ai/project/profile.json',
      JSON.stringify({
        project: { name: 'other-angular-app' },
        branch: { base: 'main' },
        activeProfiles: ['angular-typescript', 'angular-html'],
      }) + '\n'
    );
    const angularInstall = install({ sourceRoot, targetRoot: angularTarget });
    const angularProfile = JSON.parse(
      fs.readFileSync(path.join(angularTarget, 'ai', 'project', 'profile.json'), 'utf8')
    );
    check(
      'ts-html-without-scss-report-profiles',
      angularInstall.angularCursorRulesCopied.join(','),
      'angular-typescript,angular-html'
    );
    check(
      'ts-html-without-scss-has-typescript-rule',
      fs.existsSync(path.join(angularTarget, '.cursor', 'rules', 'angular-typescript.mdc')),
      true
    );
    check(
      'ts-html-without-scss-has-html-rule',
      fs.existsSync(path.join(angularTarget, '.cursor', 'rules', 'ui-html.mdc')),
      true
    );
    check(
      'ts-html-without-scss-omits-scss-rule',
      fs.existsSync(path.join(angularTarget, '.cursor', 'rules', 'ui-scss.mdc')),
      false
    );
    check('angular-target-keeps-its-base', angularProfile.branch.base, 'main');
    check('angular-target-keeps-its-name', angularProfile.project.name, 'other-angular-app');

    const allAngularTarget = path.join(parent, 'all-angular-profiles');
    fs.mkdirSync(allAngularTarget);
    write(
      allAngularTarget,
      'ai/project/profile.json',
      JSON.stringify({
        project: { name: 'full-angular-app' },
        branch: { base: 'main' },
        activeProfiles: ['angular-typescript', 'angular-html', 'angular-scss'],
      }) + '\n'
    );
    const allAngularInstall = install({ sourceRoot, targetRoot: allAngularTarget });
    check(
      'all-angular-profiles-report',
      allAngularInstall.angularCursorRulesCopied.join(','),
      'angular-typescript,angular-html,angular-scss'
    );
    check(
      'all-angular-profiles-has-typescript-rule',
      fs.existsSync(path.join(allAngularTarget, '.cursor', 'rules', 'angular-typescript.mdc')),
      true
    );
    check(
      'all-angular-profiles-has-html-rule',
      fs.existsSync(path.join(allAngularTarget, '.cursor', 'rules', 'ui-html.mdc')),
      true
    );
    check(
      'all-angular-profiles-has-scss-rule',
      fs.existsSync(path.join(allAngularTarget, '.cursor', 'rules', 'ui-scss.mdc')),
      true
    );

    const cliConflict = path.join(parent, 'cli-conflict');
    fs.mkdirSync(cliConflict);
    write(cliConflict, 'AGENTS.md', '# User instructions\nDo not replace this file.\n');
    const cliConflictRun = spawnSync(
      process.execPath,
      [path.join(sourceRoot, 'ai', 'install', 'bootstrap.mjs'), '--source', sourceRoot, '--target', cliConflict],
      { encoding: 'utf8' }
    );
    check('installer-cli-conflict-exit', cliConflictRun.status, 3);
    check(
      'installer-cli-preserves-agents',
      fs.readFileSync(path.join(cliConflict, 'AGENTS.md'), 'utf8').includes('Do not replace this file.'),
      true
    );
    const cliConflictOutput = cliConflictRun.stdout + cliConflictRun.stderr;
    check(
      'installer-cli-conflict-explains-agents-merge',
      cliConflictOutput.includes('AGENTS.md conflict') &&
        cliConflictOutput.includes('never overwrites or auto-merges user-owned files'),
      true
    );

    const cliRepeat = spawnSync(
      process.execPath,
      [path.join(sourceRoot, 'ai', 'install', 'bootstrap.mjs'), '--source', sourceRoot, '--target', installed],
      { encoding: 'utf8' }
    );
    check('installer-cli-repeat-exit', cliRepeat.status ?? 1, 0);

    const partial = path.join(parent, 'partial-copy');
    fs.mkdirSync(partial);
    fs.writeFileSync(path.join(partial, '.cursor'), 'not-a-directory');
    const partialRun = spawnSync(
      process.execPath,
      [path.join(sourceRoot, 'ai', 'install', 'bootstrap.mjs'), '--source', sourceRoot, '--target', partial],
      { encoding: 'utf8' }
    );
    check('installer-cli-partial-failure-exit', partialRun.status, 4);
    check('partial-copy-preserves-blocker', fs.readFileSync(path.join(partial, '.cursor'), 'utf8'), 'not-a-directory');
    check('partial-copy-keeps-earlier-file', fs.existsSync(path.join(partial, 'ai', 'CORE_VERSION')), true);
    const partialReport = JSON.parse(
      fs.readFileSync(path.join(partial, 'ai', 'install', 'conflict-report.json'), 'utf8')
    );
    check('partial-copy-reports-error', partialReport.errors.length > 0, true);
    check('partial-copy-does-not-claim-rollback', partialReport.rollback, false);

    const cleanSource = path.join(parent, 'clean-source');
    fs.mkdirSync(cleanSource);
    for (const input of ['ai', '.codex', 'rules', 'AGENTS.md']) {
      fs.cpSync(path.join(sourceRoot, input), path.join(cleanSource, input), { recursive: true });
    }
    check('clean-source-has-no-cursor-dir', fs.existsSync(path.join(cleanSource, '.cursor')), false);
    check('clean-source-has-no-cursorrules', fs.existsSync(path.join(cleanSource, '.cursorrules')), false);
    const cleanValidation = spawnSync(process.execPath, [path.join('ai', 'validate.mjs')], {
      cwd: cleanSource,
      encoding: 'utf8',
    });
    check('clean-clone-validation', cleanValidation.status ?? 1, 0);
    if ((cleanValidation.status ?? 1) !== 0) {
      const relevant = (cleanValidation.stdout + cleanValidation.stderr)
        .split(/\r?\n/)
        .filter((line) => line.startsWith('FAIL '))
        .slice(0, 8);
      for (const line of relevant) console.log('  ' + line);
    }
    write(cleanSource, '.cursor/rules/figma-implementation-design-qa.mdc', 'local figma rule\n');
    write(cleanSource, '.cursor/rules/git-commit-rules.mdc', 'local git rule\n');
    write(cleanSource, '.cursorrules', 'local\n');
    const cleanTarget = path.join(parent, 'clean-target');
    fs.mkdirSync(cleanTarget);
    const cleanInstall = install({ sourceRoot: cleanSource, targetRoot: cleanTarget });
    check('clean-source-install-has-no-conflicts', cleanInstall.conflicts.length, 0);
    check('clean-source-install-has-no-errors', cleanInstall.errors.length, 0);
    check(
      'clean-source-does-not-copy-figma-rule',
      fs.existsSync(path.join(cleanTarget, '.cursor', 'rules', 'figma-implementation-design-qa.mdc')),
      false
    );
    check(
      'clean-source-does-not-copy-git-commit-rule',
      fs.existsSync(path.join(cleanTarget, '.cursor', 'rules', 'git-commit-rules.mdc')),
      false
    );
    check('clean-source-does-not-copy-cursorrules', fs.existsSync(path.join(cleanTarget, '.cursorrules')), false);
    check(
      'clean-source-writes-shared-cursor-rule',
      fs.readFileSync(path.join(cleanTarget, '.cursor', 'rules', 'git-and-delivery.mdc'), 'utf8').includes(
        'ai/rules/git-and-delivery.md'
      ),
      true
    );
    check(
      'clean-source-writes-minimal-implementation-cursor-rule',
      fs.readFileSync(path.join(cleanTarget, '.cursor', 'rules', 'minimal-implementation.mdc'), 'utf8').includes(
        'ai/rules/minimal-implementation.md'
      ),
      true
    );
    const cleanRepeat = install({ sourceRoot: cleanSource, targetRoot: cleanTarget });
    check('clean-source-repeat-has-no-conflicts', cleanRepeat.conflicts.length, 0);
    check('clean-source-repeat-has-no-errors', cleanRepeat.errors.length, 0);
    const dirtyTarget = path.join(parent, 'dirty-source-target');
    fs.mkdirSync(dirtyTarget);
    const dirtyInstall = install({ sourceRoot, targetRoot: dirtyTarget });
    check('dirty-source-install-has-no-conflicts', dirtyInstall.conflicts.length, 0);
    check(
      'dirty-source-does-not-copy-figma-rule',
      fs.existsSync(path.join(dirtyTarget, '.cursor', 'rules', 'figma-implementation-design-qa.mdc')),
      false
    );
    check(
      'dirty-source-does-not-copy-git-commit-rule',
      fs.existsSync(path.join(dirtyTarget, '.cursor', 'rules', 'git-commit-rules.mdc')),
      false
    );

    const metadataSource = path.join(parent, 'metadata-source');
    fs.mkdirSync(metadataSource);
    for (const input of ['ai', '.codex', 'rules', 'AGENTS.md']) {
      fs.cpSync(path.join(sourceRoot, input), path.join(metadataSource, input), { recursive: true });
    }
    write(metadataSource, 'ai/.DS_Store', 'mac folder metadata\n');
    write(metadataSource, 'ai/._hidden', 'appledouble resource fork\n');
    write(metadataSource, 'ai/.AppleDouble', 'appledouble sidecar\n');
    write(metadataSource, 'ai/core/.DS_Store', 'nested mac folder metadata\n');
    const metadataTarget = path.join(parent, 'metadata-target');
    fs.mkdirSync(metadataTarget);
    const metadataInstall = install({ sourceRoot: metadataSource, targetRoot: metadataTarget });
    check('metadata-install-has-no-errors', metadataInstall.errors.length, 0);
    check('metadata-excludes-ds-store', fs.existsSync(path.join(metadataTarget, 'ai', '.DS_Store')), false);
    check('metadata-excludes-nested-ds-store', fs.existsSync(path.join(metadataTarget, 'ai', 'core', '.DS_Store')), false);
    check('metadata-excludes-dot-underscore', fs.existsSync(path.join(metadataTarget, 'ai', '._hidden')), false);
    check('metadata-excludes-appledouble', fs.existsSync(path.join(metadataTarget, 'ai', '.AppleDouble')), false);
    check('metadata-still-copies-core', fs.existsSync(path.join(metadataTarget, 'ai', 'CORE_VERSION')), true);

    const missingVersionSource = path.join(parent, 'missing-core-version-source');
    fs.mkdirSync(missingVersionSource);
    for (const input of ['ai', '.codex', 'rules', 'AGENTS.md']) {
      fs.cpSync(path.join(sourceRoot, input), path.join(missingVersionSource, input), { recursive: true });
    }
    fs.rmSync(path.join(missingVersionSource, 'ai', 'CORE_VERSION'));
    const missingVersionTarget = path.join(parent, 'missing-core-version-target');
    fs.mkdirSync(missingVersionTarget);
    const missingVersionRun = spawnSync(
      process.execPath,
      [
        path.join(missingVersionSource, 'ai', 'install', 'bootstrap.mjs'),
        '--source',
        missingVersionSource,
        '--target',
        missingVersionTarget,
      ],
      { encoding: 'utf8' }
    );
    check('missing-core-version-exit', missingVersionRun.status, 4);
    let missingVersionReport = null;
    try {
      missingVersionReport = JSON.parse(missingVersionRun.stdout);
    } catch {
      missingVersionReport = null;
    }
    check('missing-core-version-prints-report', Boolean(missingVersionReport), true);
    check(
      'missing-core-version-reports-error',
      Boolean(missingVersionReport?.errors?.some((item) => item.path === 'ai/CORE_VERSION')),
      true
    );
    check(
      'missing-core-version-writes-report-file',
      fs.existsSync(path.join(missingVersionTarget, 'ai', 'install', 'conflict-report.json')),
      true
    );
    check(
      'missing-core-version-stderr-explains-failure',
      missingVersionRun.stderr.includes('Bootstrap failed (exit 4): ai/CORE_VERSION'),
      true
    );
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
    console.log('PORTABILITY FIXTURES CLEANED');
  }

  return failed;
}
