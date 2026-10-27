import fs from 'fs';
import path from 'path';

export function loadProfile(root) {
  const file = path.join(root, 'ai', 'project', 'profile.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const DEFAULT_TICKETLESS_HEADER = '^([a-z]+)\\(([^(),\\n]+)\\)(!)?: (\\S.*)$';

export function validateCommitMessage(message, profile, options = {}) {
  const normalized = message.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const errors = [];
  const header = lines[0] ?? '';
  const ticketPattern = profile?.commits?.headerPattern;
  const convention = profile?.commits?.convention;
  const ticketlessPattern =
    profile?.commits?.ticketlessHeaderPattern ||
    (convention === 'conventional-commits' || !convention ? DEFAULT_TICKETLESS_HEADER : '');
  const types = new Set(profile?.commits?.types ?? []);
  const hasTicket = options.hasTicket;
  const conventionUnknown = convention === 'unknown';

  function matchHeader(source) {
    if (!source) return null;
    try {
      return header.match(new RegExp(source));
    } catch {
      return null;
    }
  }

  let match = null;
  if (conventionUnknown && !ticketPattern && hasTicket !== false) {
    errors.push('project profile has no commits.headerPattern');
  } else if (hasTicket === true) {
    match = matchHeader(ticketPattern);
    if (!match) errors.push('header does not match the project profile commits.headerPattern');
  } else if (hasTicket === false) {
    match = matchHeader(ticketlessPattern);
    if (!match) errors.push('header does not match the project profile ticketless commit pattern');
  } else {
    match = matchHeader(ticketPattern) || matchHeader(ticketlessPattern);
    if (!match) errors.push('header does not match the project profile commits.headerPattern');
  }

  if (match) {
    if (types.size > 0 && !types.has(match[1])) errors.push('type is not allowed');
    if (match[2] !== undefined && match[2] !== match[2].trim()) {
      errors.push('scope must not have surrounding whitespace');
    }
  }

  const bodyRequired = profile?.commits?.bodyRequired !== false;
  if (bodyRequired && (lines.length < 3 || lines[1] !== '' || !lines[2]?.trim())) {
    errors.push('description must follow the header after one blank line');
  }
  if (/^breaking change:/im.test(normalized) && !/^BREAKING CHANGE:/m.test(normalized)) {
    errors.push('breaking change footer must use uppercase BREAKING CHANGE:');
  }

  return errors;
}

const noCommitPattern =
  /\b(do not commit|don't commit|do not create commits|no commits|skip commits|without committing)\b/i;

export function shouldPrepareCommitProposal(instruction) {
  return !noCommitPattern.test(instruction ?? '');
}

export function interpretCommitApproval(responseText, groupIds) {
  const text = (responseText ?? '').trim();
  if (noCommitPattern.test(text)) {
    return { action: 'skip', approved: [], reason: 'explicit-no-commit' };
  }
  if (/approve (all|these)( commit)? groups/i.test(text)) {
    return { action: 'approve', approved: groupIds.slice(), reason: 'all-groups' };
  }
  const approved = groupIds.filter((id) => {
    const name = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const accepted = new RegExp('\\bapprove\\s+' + name + '\\b', 'i').test(text);
    const rejected = new RegExp('\\bdo not approve\\s+' + name + '\\b', 'i').test(text);
    return accepted && !rejected;
  });
  if (approved.length === 0) {
    return { action: 'clarify', approved: [], reason: 'ambiguous-or-none' };
  }
  return { action: 'approve', approved, reason: 'group-specific' };
}

export function reviewProposal({ groupFiles, taskOwned, preExisting }) {
  const owned = new Set(taskOwned);
  const existing = new Set(preExisting);
  const blocked = groupFiles.filter((file) => existing.has(file) || !owned.has(file));
  return { accept: blocked.length === 0, blocked };
}

export function classifyCheck(input) {
  if (input.applicable === false) {
    return { status: 'NOT APPLICABLE', passed: false, reason: input.reason ?? 'does-not-apply' };
  }
  if (input.commandKnown === false) {
    return { status: 'NOT RUN', passed: false, reason: 'unknown-command' };
  }
  if (input.toolAvailable === false) {
    return { status: 'BLOCKED', passed: false, reason: 'tool-unavailable' };
  }
  if (!input.executed) {
    return { status: 'NOT RUN', passed: false, reason: 'not-executed' };
  }
  if (input.exitCode === 0) {
    return { status: 'PASSED', passed: true, reason: 'executed' };
  }
  return { status: 'FAILED', passed: false, reason: 'nonzero-exit' };
}

export function compareProfileToDiscovery(profile, discovery) {
  const conflicts = [];
  const verified = new Map((discovery.verified ?? []).map((item) => [item.key, item.value]));
  for (const key of ['packageManager', 'tickets.provider']) {
    if (!verified.has(key)) continue;
    const profileValue = key.split('.').reduce((current, part) => current?.[part], profile);
    if (profileValue && profileValue !== 'unknown' && profileValue !== verified.get(key)) {
      conflicts.push({ key, profile: profileValue, discovery: verified.get(key) });
    }
  }
  return { conflicts, autoOverwrite: false };
}

export function adapterStatesApprovalHardLock(text) {
  const statesLimit = /hard-lock[^.\n]{0,160}approval/i.test(text);
  const falseGuarantee = /(?:automatically|platform) guarantees approval before/i.test(text);
  return statesLimit && !falseGuarantee;
}
