import { spawnSync } from 'child_process';

function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);
}

function isUsable(value) {
  return Boolean(value) && value !== 'unknown' && value !== 'none';
}

export function classifyStoryInput({ url, ticketId, pastedText } = {}) {
  const pasted = String(pastedText ?? '').trim();
  if (url) {
    return { mode: 'url', requiresRetrieval: true, ticketId: ticketId ?? null, source: 'url' };
  }
  if (ticketId) {
    return { mode: 'id', requiresRetrieval: true, ticketId, source: 'id' };
  }
  if (pasted) {
    return { mode: 'pasted', requiresRetrieval: false, ticketId: null, source: 'pasted' };
  }
  return { mode: 'missing', requiresRetrieval: false, ticketId: null, source: null };
}

export function analyzePastedStory(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    return {
      complete: false,
      proceed: false,
      ask: true,
      gaps: ['missing-story'],
      inventedAcceptance: false,
    };
  }
  const hasExpectedBehavior =
    /\b(acceptance criteria|given |when |then |must |should |expected behavior|reproduce|steps to reproduce)\b/i.test(
      trimmed
    );
  const gaps = [];
  if (!hasExpectedBehavior) gaps.push('acceptance-criteria-or-expected-behavior');
  return {
    complete: trimmed.length >= 20 && hasExpectedBehavior,
    proceed: trimmed.length >= 20 && hasExpectedBehavior,
    ask: trimmed.length < 20 || !hasExpectedBehavior,
    gaps,
    inventedAcceptance: false,
  };
}

export function storyAllowsWorkflow(input, profile) {
  const classified = classifyStoryInput(input);
  if (classified.mode === 'url' || classified.mode === 'id') {
    return { ok: true, ...classified, skipForMissingTicket: false };
  }
  if (classified.mode === 'pasted') {
    const analysis = analyzePastedStory(input.pastedText);
    return {
      ok: analysis.proceed,
      ...classified,
      analysis,
      skipForMissingTicket: false,
    };
  }
  const ticketsRequired = profile?.tickets?.required === true;
  return {
    ok: false,
    ...classified,
    reason: ticketsRequired ? 'missing-story-source' : 'missing-story-source',
    skipForMissingTicket: false,
  };
}

export function branchKind(taskType) {
  const type = String(taskType ?? 'feature').toLowerCase();
  if (['bug', 'fix', 'sub-bug', 'hotfix'].includes(type)) return 'bug';
  if (['docs', 'documentation'].includes(type)) return 'docs';
  if (['refactor'].includes(type)) return 'refactor';
  if (['test', 'tests'].includes(type)) return 'test';
  if (['chore', 'build', 'ci'].includes(type)) return 'chore';
  return 'feature';
}

function fillTemplate(template, { ticketId, summary, projectName, number }) {
  return template
    .replaceAll('<ticket-id>', ticketId ?? '')
    .replaceAll('<jira-ticket>', ticketId ?? '')
    .replaceAll('<number>', number ?? (ticketId ? String(ticketId).replace(/^[a-z]+-/i, '') : ''))
    .replaceAll('<short-kebab-summary>', summary)
    .replaceAll('<project-name>', projectName)
    .replace(/\/{2,}/g, '/')
    .replace(/-{2,}/g, '-')
    .replace(/\/-|-\//g, '/')
    .replace(/\/$/g, '');
}

export function validateBranchNameWithGit(name) {
  if (typeof name !== 'string' || name.length === 0) {
    return { valid: false, checked: false, reason: 'empty' };
  }
  const result = spawnSync('git', ['check-ref-format', '--branch', name], { encoding: 'utf8' });
  if (result.error || result.status == null) {
    return { valid: false, checked: false, reason: 'git-unavailable' };
  }
  if (result.status === 0) return { valid: true, checked: true, name };
  return { valid: false, checked: true, reason: 'invalid-ref' };
}

export function resolveBaseBranch(profile) {
  if (!profile?.branch || !Object.prototype.hasOwnProperty.call(profile.branch, 'base')) {
    return { ok: false, action: 'ask', reason: 'missing-base', configured: null, usedFallback: false };
  }
  const configured = profile.branch.base;
  if (configured === 'unknown' || configured === '') {
    return { ok: false, action: 'ask', reason: 'unknown-base', configured, usedFallback: false };
  }
  if (configured === 'none') {
    return { ok: true, action: 'stay', configured, usedFallback: false };
  }
  const ref = validateBranchNameWithGit(configured);
  if (!ref.checked) {
    return { ok: false, action: 'ask', reason: 'ref-check-unavailable', configured, usedFallback: false };
  }
  if (!ref.valid) {
    return { ok: false, action: 'ask', reason: 'invalid-ref', configured, usedFallback: false };
  }
  return { ok: true, action: 'use', configured, name: configured, usedFallback: false };
}

export function verifyConfiguredBase({ configured, localBranches = [], remoteBranches = [] } = {}) {
  if (!configured || configured === 'unknown' || configured === 'none') {
    return { verified: false, reason: 'unresolved', configured: configured ?? null };
  }
  const present =
    localBranches.includes(configured) ||
    remoteBranches.includes(configured) ||
    remoteBranches.includes(`origin/${configured}`);
  if (!present) return { verified: false, reason: 'unavailable', configured };
  return { verified: true, reason: 'present', configured };
}

export function reconcileBaseDiscovery({ configured, discovered } = {}) {
  const explicit = Boolean(configured) && configured !== 'unknown';
  const conflict = explicit && Boolean(discovered) && discovered !== 'unknown' && discovered !== configured;
  return {
    keep: explicit ? configured : configured ?? 'unknown',
    overwrite: false,
    conflict,
    discovered: discovered ?? null,
  };
}

export function coreFallbackBranchName({ projectName, ticketId, kind, summary }) {
  const prefix =
    {
      bug: 'fix',
      feature: 'feat',
      docs: 'docs',
      refactor: 'refactor',
      test: 'test',
      chore: 'chore',
    }[kind] ?? 'feat';
  const slug = slugify(summary);
  if (!slug) return { ok: false, reason: 'missing-summary' };
  const project = projectName && projectName !== 'unknown' ? slugify(projectName) : '';
  if (!project) return { ok: false, reason: 'unknown-project-name' };
  if (ticketId) {
    const ticket = slugify(ticketId);
    if (!ticket) return { ok: false, reason: 'invalid-ticket-id' };
    return { ok: true, name: `${prefix}/${project}/${ticket}/${slug}` };
  }
  return { ok: true, name: `${prefix}/${project}/${slug}` };
}

function finishBranchName(name, kind, usedFallback, reason) {
  const ref = validateBranchNameWithGit(name);
  if (!ref.checked) {
    return { ok: false, reason: 'ref-check-unavailable', name, kind, usedFallback, refChecked: false };
  }
  if (!ref.valid) {
    return { ok: false, reason: 'invalid-ref', name, kind, usedFallback, refChecked: true };
  }
  return { ok: true, name, kind, usedFallback, reason, refChecked: true };
}

export function resolveBranchName({ profile, ticketId, taskType, summary }) {
  const kind = branchKind(taskType);
  const configuredName = profile?.project?.name;
  const projectName = configuredName && configuredName !== 'unknown' ? configuredName : null;
  const slug = slugify(summary);
  const ticketedKey = {
    bug: 'bug',
    feature: 'feature',
    docs: 'docs',
    refactor: 'refactor',
    test: 'test',
    chore: 'chore',
  }[kind];
  const ticketlessKey = {
    bug: 'ticketlessBug',
    feature: 'ticketlessFeature',
    docs: 'ticketlessDocs',
    refactor: 'ticketlessRefactor',
    test: 'ticketlessTest',
    chore: 'ticketlessChore',
  }[kind];
  const template = ticketId
    ? profile?.branch?.[ticketedKey] || (kind === 'feature' ? profile?.branch?.feature : undefined)
    : profile?.branch?.[ticketlessKey] || (kind === 'feature' ? profile?.branch?.ticketlessFeature : undefined);

  const base = resolveBaseBranch(profile);
  if (!base.ok) return { ok: false, reason: base.reason, kind, usedFallback: false };

  if (ticketId && profile?.tickets?.idPattern && profile.tickets.idPattern !== 'unknown') {
    const pattern = new RegExp(profile.tickets.idPattern);
    if (!pattern.test(String(ticketId))) {
      return { ok: false, reason: 'unverified-ticket-id', kind, usedFallback: false };
    }
  }

  if (template && template !== 'unknown') {
    if (!ticketId && /<ticket-id>|<jira-ticket>|<number>/.test(template)) {
      const fallback = coreFallbackBranchName({ projectName, ticketId: null, kind, summary: slug });
      if (!fallback.ok) return { ok: false, reason: fallback.reason, kind, usedFallback: true };
      return finishBranchName(fallback.name, kind, true, 'ticket-template-without-ticket');
    }
    if (template.includes('<project-name>') && !projectName) {
      return { ok: false, reason: 'unknown-project-name', kind, usedFallback: false };
    }
    const number = ticketId ? String(ticketId).replace(/^[a-z]+-/i, '') : '';
    return finishBranchName(
      fillTemplate(template, { ticketId, summary: slug, projectName: projectName ?? '', number }),
      kind,
      false,
      'profile-template'
    );
  }

  const fallback = coreFallbackBranchName({ projectName, ticketId, kind, summary: slug });
  if (!fallback.ok) return { ok: false, reason: fallback.reason, kind, usedFallback: true };
  return finishBranchName(fallback.name, kind, true, 'core-fallback');
}

export function planBranchPreparation({
  currentBranch,
  statusShort,
  intendedName,
  localBranches = [],
  remoteBranches = [],
  base,
  existingBelongsToTask,
  dirtyUnrelated,
} = {}) {
  if (!isUsable(base) && base !== 'none') {
    return { action: 'ask', reason: 'unknown-base', create: false, checkout: false };
  }
  if (base === 'none') {
    return { action: 'stay', reason: 'branching-not-required', create: false, checkout: false };
  }
  if (!intendedName) {
    return { action: 'ask', reason: 'missing-branch-name', create: false, checkout: false };
  }
  const ref = validateBranchNameWithGit(intendedName);
  if (!ref.checked) {
    return { action: 'ask', reason: 'ref-check-unavailable', create: false, checkout: false };
  }
  if (!ref.valid) {
    return { action: 'ask', reason: 'invalid-ref', create: false, checkout: false };
  }
  if (dirtyUnrelated) {
    return { action: 'ask', reason: 'unrelated-dirty-tree', create: false, checkout: false };
  }
  const dirty = Boolean(String(statusShort ?? '').trim());
  if (dirty && currentBranch !== intendedName) {
    return { action: 'ask', reason: 'dirty-working-tree-on-other-branch', create: false, checkout: false };
  }
  if (currentBranch === intendedName) {
    return { action: 'resume', reason: 'already-on-task-branch', create: false, checkout: false };
  }
  const localHit = localBranches.includes(intendedName);
  const remoteHit = remoteBranches.includes(intendedName);
  if (localHit || remoteHit) {
    if (existingBelongsToTask === true) {
      return {
        action: 'resume-existing',
        reason: 'existing-task-branch',
        create: false,
        checkout: true,
        reset: false,
      };
    }
    return { action: 'ask', reason: 'branch-name-collision', create: false, checkout: false, reset: false };
  }
  return {
    action: 'create',
    reason: 'new-task-branch',
    create: true,
    checkout: true,
    from: base,
    name: intendedName,
    pull: false,
    commit: false,
    push: false,
  };
}

export function claimedGitSucceeded({ commandRan, exitCode, verifiedBranch, expectedBranch }) {
  return Boolean(commandRan) && exitCode === 0 && verifiedBranch === expectedBranch;
}
