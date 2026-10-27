import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { loadProfile, validateCommitMessage } from './lib/policy.mjs';
import { runPortabilitySelfTest } from './portability-self-test.mjs';

function resolveValidationRoot(argv = process.argv) {
  const rootFlag = argv.indexOf('--root');
  if (rootFlag >= 0) {
    const value = argv[rootFlag + 1];
    if (!value || value.startsWith('-')) {
      console.error('Usage: node ai/validate.mjs [--root <repository>] [--self-test]');
      process.exit(1);
    }
    return path.resolve(value);
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

const root = resolveValidationRoot();
let failed = false;

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
}

function fail(message) {
  console.log('FAIL', message);
  failed = true;
}

function requireExactlyOnce(text, phrase, message) {
  const count = text.split(phrase).length - 1;
  if (count !== 1) fail(message + ' (found ' + count + ')');
}

function rejectPatterns(text, file, checks) {
  for (const [pattern, message] of checks) {
    if (pattern.test(text)) fail(file + ' ' + message);
  }
}

function rejectAffirmativeClauses(text, file, checks) {
  const clauses = text
    .toLowerCase()
    .split(/(?:[.\n;]+|,\s*(?:but|however|yet|although)\s+|\b(?:but|however|yet|although)\b[:,]?\s*)/i)
    .map((clause) => clause.trim())
    .filter(Boolean);

  function hasLocalNegativePrefix(clause, matchIndex) {
    const prefix = clause.slice(0, matchIndex);
    return (
      /\bno\s*$/.test(prefix) ||
      /\bno\s+(?:agent|tool|user|one|person|process|automation|files?)\b(?:\s+\w+){0,2}\s*$/.test(prefix) ||
      /\b(?:do|does)\s+not(?:\s+(?:ever|directly|individually))*\s*$/.test(prefix) ||
      /\bnever(?:\s+ever)*\s*$/.test(prefix) ||
      /\b(?:cannot|can\s+not|must\s+not|should\s+not|may\s+(?:not|never))\s*$/.test(prefix) ||
      /\b(?:can't|mustn't|shouldn't)\s*$/.test(prefix)
    );
  }

  for (const [pattern, message] of checks) {
    const contradiction = clauses.some((clause) => {
      const matcher = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g');
      let match = matcher.exec(clause);
      while (match) {
        if (!hasLocalNegativePrefix(clause, match.index)) return true;
        match = matcher.exec(clause);
      }
      return false;
    });
    if (contradiction) fail(file + ' ' + message);
  }
}

function frontmatter(text, file) {
  if (!text.startsWith('---\n')) {
    fail(file + ' missing frontmatter');
    return null;
  }
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) {
    fail(file + ' unclosed frontmatter');
    return null;
  }
  const fields = {};
  for (const line of text.slice(4, end).split('\n')) {
    if (!line.trim()) continue;
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      fail(file + ' bad frontmatter line ' + line);
      continue;
    }
    fields[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return { fields, body: text.slice(end + 5) };
}

const canonical = [
  'ai/README.md',
  'ai/rules/project-context.md',
  'ai/rules/angular-typescript.md',
  'ai/rules/ui-html.md',
  'ai/rules/ui-scss.md',
  'ai/rules/testing-and-quality.md',
  'ai/rules/jira-and-branch.md',
  'ai/rules/git-and-delivery.md',
  'ai/rules/minimal-implementation.md',
  'ai/core/lifecycle.md',
  'ai/workflows/development-lifecycle.md',
  'ai/core/issue-tracker.md',
  'ai/core/evidence.md',
  'ai/project/SCHEMA.md',
  'ai/CORE_VERSION',
  'ai/agents/implementer.md',
  'ai/agents/code-reviewer.md',
  'ai/agents/test-engineer.md',
  'ai/adapters/cursor.md',
  'ai/adapters/codex.md',
  'ai/adapters/chatgpt.md',
  'ai/adapters/generic.md',
];

for (const file of canonical) {
  if (!fs.existsSync(path.join(root, file))) fail('missing canonical ' + file);
}

const workflowRequirements = [
  'Single-agent fallback',
  'A. Task Blocker',
  'B. Task Defect',
  'C. Project Rule Candidate',
  'D. Agent Improvement Candidate',
  'E. Informational / Future Improvement',
  'No new agent or rule improvements identified for this task.',
  'READY FOR QA',
  'BLOCKED',
  'NOT READY',
  'A completion message is not proof.',
  'Implementer role',
  'Code Reviewer role',
  'Test Engineer role',
  'A missing story URL or ticket ID is not, by itself, a reason to skip branch preparation',
  'A pasted story is a valid primary source',
];

const workflow = read('ai/core/lifecycle.md');
for (const phrase of workflowRequirements) {
  if (!workflow.includes(phrase)) fail('workflow missing: ' + phrase);
}

const passContract = 'no category A or B finding remains open';
const failContract = 'any confirmed category B defect remains unresolved';
const blockedContract = 'any category A finding remains open, or the requirements or diff are missing or unavailable';
const reviewerText = read('ai/agents/code-reviewer.md');
requireExactlyOnce(reviewerText, '- `PASS` — ' + passContract, 'reviewer PASS contract missing or duplicated');
requireExactlyOnce(reviewerText, '- `FAIL` — ' + failContract, 'reviewer FAIL contract missing or duplicated');
requireExactlyOnce(reviewerText, '- `BLOCKED` — ' + blockedContract, 'reviewer BLOCKED contract missing or duplicated');
if (reviewerText.includes('no open critical or high')) fail('reviewer still allows PASS with lower-severity defects');
if (!workflow.includes(passContract)) fail('lifecycle PASS contract missing');
if (!workflow.includes(failContract)) fail('lifecycle FAIL contract missing');
if (workflow.includes('no open critical or high')) fail('lifecycle still uses severity as a PASS filter');
const notRunContract = 'A mandatory check left `NOT RUN` without an external blocker makes the task `NOT READY`.';
const blockedCheckContract = 'A mandatory check left `BLOCKED` by an external dependency makes the task `BLOCKED`.';
const notApplicableContract =
  '`NOT APPLICABLE` requires a documented reason and may be used only when the check genuinely does not apply. It is neither `PASSED` nor `FAILED`, does not satisfy a mandatory applicable check, and does not block `READY FOR QA`.';
requireExactlyOnce(
  workflow,
  '`NOT RUN` and `BLOCKED` checks are never `PASSED`.',
  'lifecycle NOT RUN and BLOCKED status rule missing or duplicated'
);
requireExactlyOnce(workflow, notRunContract, 'lifecycle NOT RUN status effect missing or duplicated');
requireExactlyOnce(workflow, blockedCheckContract, 'lifecycle BLOCKED status effect missing or duplicated');
requireExactlyOnce(workflow, notApplicableContract, 'lifecycle NOT APPLICABLE contract missing or duplicated');

for (const [file, text] of [
  ['ai/agents/code-reviewer.md', reviewerText],
  ['ai/core/lifecycle.md', workflow],
]) {
  rejectPatterns(text.toLowerCase(), file, [
    [
      /(?:`?pass`?|passing review)[^.\n]{0,140}(?:with|despite|while|even (?:if|when)|allow(?:ed|s)?|permit(?:ted|s)?)[^.\n]{0,100}(?:open|unresolved)[^.\n]{0,40}category [ab]/i,
      'explicitly permits PASS with an open category A or B finding',
    ],
    [
      /(?:open|unresolved)[^.\n]{0,40}category [ab][^.\n]{0,140}(?:allow(?:ed|s)?|permit(?:ted|s)?|may|can|still|does not prevent)[^.\n]{0,60}(?:`?pass`?|passing review)/i,
      'explicitly permits PASS with an open category A or B finding',
    ],
  ]);
}

rejectPatterns(workflow.toLowerCase(), 'ai/core/lifecycle.md', [
  [
    /ready for qa[^.\n]{0,160}(?:with|despite|while|even (?:if|when)|allow(?:ed|s)?|permit(?:ted|s)?)[^.\n]{0,120}mandatory[^.\n]{0,60}not run/i,
    'explicitly permits READY FOR QA with a mandatory NOT RUN check',
  ],
  [
    /mandatory[^.\n]{0,80}not run[^.\n]{0,140}(?:allow(?:ed|s)?|permit(?:ted|s)?|may|can|still|does not prevent)[^.\n]{0,80}ready for qa/i,
    'explicitly permits READY FOR QA with a mandatory NOT RUN check',
  ],
]);

const testEngineer = read('ai/agents/test-engineer.md');
const testingRule = read('ai/rules/testing-and-quality.md');
if (!testEngineer.includes('`NOT RUN` and `BLOCKED` are never `PASSED`')) {
  fail('test engineer status contract missing');
}
if (!testEngineer.includes('ai/core/lifecycle.md')) {
  fail('test engineer does not use the lifecycle status gate');
}
if (!testingRule.includes('`NOT RUN` and `BLOCKED` are never `PASSED`')) {
  fail('testing rule status contract missing');
}
requireExactlyOnce(testEngineer, notApplicableContract, 'test engineer NOT APPLICABLE contract missing or duplicated');
requireExactlyOnce(testingRule, notApplicableContract, 'testing rule NOT APPLICABLE contract missing or duplicated');

const baselineEvidenceContract =
  'Do not classify a failed check as pre-existing or unrelated unless it is reproduced on the verified task base ref or supported by equivalent baseline CI evidence. If baseline evidence is unavailable, classify the claim as `UNVERIFIED`.';
requireExactlyOnce(
  testEngineer,
  baselineEvidenceContract,
  'test engineer baseline evidence contract missing or duplicated'
);
const baselineWorkingTreeContract =
  'Obtain baseline evidence without resetting, stashing, or discarding the working tree, and preserve existing user changes.';
requireExactlyOnce(
  testEngineer,
  baselineWorkingTreeContract,
  'test engineer non-destructive baseline contract missing or duplicated'
);

const finalReportEvidenceContract =
  'For every executed check in the final report, include the exact command, exit code, and concise relevant output. For each relevant failure, include concise evidence from the output.';
requireExactlyOnce(
  workflow,
  finalReportEvidenceContract,
  'lifecycle final report command and failure evidence contract missing or duplicated'
);
rejectPatterns(workflow.toLowerCase(), 'ai/core/lifecycle.md', [
  [
    /final reports?[^.\n]{0,100}(?:\b(?:may|can)\b(?:(?!\b(?:not|never)\b)[^.\n]){0,30}\bomit\b|\b(?:are|is)\s+(?:explicitly\s+)?(?:allowed|permitted)\s+to\s+omit\b)[^.\n]{0,100}(?:exact commands?|exit codes?|concise (?:failure )?evidence)/i,
    'allows final reports to omit exact commands, exit codes, or concise failure evidence',
  ],
]);

for (const [file, text] of [
  ['ai/rules/testing-and-quality.md', testingRule],
  ['ai/agents/test-engineer.md', testEngineer],
  ['ai/core/lifecycle.md', workflow],
]) {
  if (!text.includes('Translation or data assertions verify values, not rendered UI')) {
    fail(file + ' missing translation/data versus rendered UI verification distinction');
  }
  rejectPatterns(text.toLowerCase(), file, [
    [
      /not applicable[^.\n]{0,100}(?:counts? as|is treated as|is equivalent to|is an alias for)[^.\n]{0,40}(?:passed|failed)/i,
      'allows NOT APPLICABLE to count as PASSED or FAILED',
    ],
    [
      /(?:mandatory applicable|applicable mandatory)[^.\n]{0,100}(?:\b(?:may|can)\b(?:(?!\b(?:not|never)\b)[^.\n]){0,60}not applicable|\b(?:is|are)\s+(?:explicitly\s+)?(?:allowed|permitted)\s+to[^.\n]{0,40}not applicable)/i,
      'allows an applicable mandatory check to be marked NOT APPLICABLE',
    ],
    [
      /not applicable[^.\n]{0,100}(?:\b(?:may|can)\b(?:(?!\b(?:not|never)\b)[^.\n]){0,30}\bsatisfy\b|\bdoes\s+satisfy\b|\bsatisfies\b|\bcounts?\s+(?:for|toward)\b)[^.\n]{0,80}mandatory applicable/i,
      'allows NOT APPLICABLE to satisfy an applicable mandatory check',
    ],
    [
      /not applicable(?:(?!\b(?:not|never)\b)[^.\n]){0,100}(?:\bis\s+(?:treated as|equivalent to|an? alias for|the same as)|\b(?:counts as|equals|means|aliases))[^.\n]{0,40}(?:not run|blocked)/i,
      'aliases NOT APPLICABLE to NOT RUN or BLOCKED',
    ],
    [
      /not applicable(?:(?!\b(?:not|never)\b)[^.\n]){0,100}\bblocks?\b[^.\n]{0,40}ready for qa/i,
      'allows NOT APPLICABLE to block READY FOR QA',
    ],
    [
      /translation or data assertions(?:(?!\b(?:not|never|cannot)\b)[^.\n]){0,100}(?:\b(?:prove|proves|guarantee|guarantees|establish|establishes)\b[^.\n]{0,60}(?:rendered ui|rtl)|\bverify(?: the)?\s+(?:rendered ui|rtl))/i,
      'claims translation or data assertions prove rendered UI or RTL behavior',
    ],
  ]);
}

rejectPatterns(testEngineer.toLowerCase(), 'ai/agents/test-engineer.md', [
  [
    /(?:\b(?:may|can)\b(?:(?!\b(?:not|never)\b)[^.\n]){0,100}|\b(?:is|are)\s+(?:explicitly\s+)?(?:allowed|permitted)\s+to[^.\n]{0,100})(?:pre-existing|unrelated)[^.\n]{0,100}without[^.\n]{0,80}(?:baseline|base ref|ci evidence)/i,
    'allows a pre-existing or unrelated classification without baseline evidence',
  ],
  [
    /(?:pre-existing|unrelated)[^.\n]{0,100}(?:\b(?:may|can)\b(?:(?!\b(?:not|never)\b)[^.\n]){0,100}|\b(?:is|are)\s+(?:explicitly\s+)?(?:allowed|permitted)\s+to[^.\n]{0,100})without[^.\n]{0,80}(?:baseline|base ref|ci evidence)/i,
    'allows a pre-existing or unrelated classification without baseline evidence',
  ],
  [
    /baseline evidence[^.\n]{0,100}(?:\b(?:may|can)\b(?:(?!\b(?:not|never)\b)[^.\n]){0,30}\b(?:reset|stash|discard)\b|\b(?:is|are)\s+(?:explicitly\s+)?(?:allowed|permitted)\s+to\s+(?:reset|stash|discard)\b)/i,
    'allows destructive baseline evidence collection',
  ],
]);
const canonicalStatusReference = 'The final status comes only from `ai/core/lifecycle.md`.';
const chatgpt = read('ai/adapters/chatgpt.md');
if (!chatgpt.includes(canonicalStatusReference)) {
  fail('chatgpt adapter does not defer to the lifecycle status gate');
}
if (chatgpt.includes('no open blockers or confirmed defects')) {
  fail('chatgpt adapter weakens the status gate');
}
for (const reference of [
  'ai/core/issue-tracker.md',
  'ai/core/evidence.md',
  'ai/project/profile.json',
  'ai/project/profile.md',
  'ai/project/SCHEMA.md',
  'ai/rules/minimal-implementation.md',
  'ai/rules/testing-and-quality.md',
  'ai/agents/implementer.md',
  'ai/agents/code-reviewer.md',
  'ai/agents/test-engineer.md',
]) {
  if (!chatgpt.includes(reference)) fail('chatgpt adapter missing reference ' + reference);
}

const toolAdapterFiles = [
  'ai/adapters/cursor.md',
  'ai/adapters/codex.md',
  'ai/adapters/chatgpt.md',
  'ai/adapters/generic.md',
];
for (const file of toolAdapterFiles) {
  const adapterText = read(file);
  if (!adapterText.includes('ai/core/lifecycle.md')) {
    fail(file + ' does not reference the canonical lifecycle');
  }
  if (!adapterText.includes('ai/rules/git-and-delivery.md')) {
    fail(file + ' does not reference the canonical git and delivery rule');
  }
  if (!/hard-lock[^.\n]{0,100}approval/i.test(adapterText)) {
    fail(file + ' does not document the lack of a platform approval hard-lock');
  }
  if (/(?:automatically|platform) guarantees approval before/i.test(adapterText)) {
    fail(file + ' falsely claims automatic approval enforcement');
  }
  const policyText = adapterText.replace(canonicalStatusReference, '');
  if (/\b(?:ready for qa|not ready|final status)\b/i.test(policyText)) {
    fail(file + ' independently defines or overrides final status');
  }
  rejectPatterns(policyText, file, [
    [
      /(?:override|supersede|ignore|weaken|looser)[^.\n]{0,100}(?:canonical|lifecycle|status|readiness)|(?:canonical|lifecycle|status|readiness)[^.\n]{0,100}(?:override|supersede|ignore|weaken|looser)/i,
      'explicitly overrides or weakens the canonical lifecycle',
    ],
  ]);
}

const testingRequirement =
  'Never report a check as passed unless that command was executed and its exit status was successful.';
if (!testingRule.includes(testingRequirement)) {
  fail('testing rule missing executed-check requirement');
}

for (const [file, text] of [
  ['ai/rules/testing-and-quality.md', testingRule],
  ['ai/agents/test-engineer.md', testEngineer],
]) {
  rejectPatterns(text.toLowerCase(), file, [
    [
      /(?:allow(?:ed|s)?|permit(?:ted|s)?|may|can)[^.\n]{0,100}(?:report|mark|record|claim)?[^.\n]{0,40}(?:`?passed`?|a pass)[^.\n]{0,100}(?:without|even (?:if|when)|not (?:executed|run))[^.\n]{0,80}(?:execut|exit status|evidence|run)/i,
      'explicitly permits PASSED without execution evidence',
    ],
    [
      /(?:`?passed`?|a pass)[^.\n]{0,100}(?:without|even (?:if|when))[^.\n]{0,80}(?:execut|exit status|evidence|run)/i,
      'explicitly permits PASSED without execution evidence',
    ],
  ]);
}

const delegationEvidenceContract =
  'Never claim that an independent agent was launched or returned a result without actual launch and result evidence from the tool.';
const staticDelegationLimit =
  'Static instruction validation can reject an explicit contradictory policy, but it cannot prove that runtime delegation occurred.';
requireExactlyOnce(workflow, delegationEvidenceContract, 'workflow delegation evidence contract missing or duplicated');
requireExactlyOnce(workflow, staticDelegationLimit, 'workflow static delegation limitation missing or duplicated');
const delegationPolicyFiles = [
  'ai/core/lifecycle.md',
  'ai/agents/implementer.md',
  'ai/agents/code-reviewer.md',
  'ai/agents/test-engineer.md',
  ...toolAdapterFiles,
];
for (const file of delegationPolicyFiles) {
  const policyText = read(file).replace(delegationEvidenceContract, '').toLowerCase();
  rejectPatterns(policyText, file, [
    [
      /(?:claim|report|state)[^.\n]{0,100}(?:independent agent|subagent|delegation)[^.\n]{0,120}(?:without|even (?:if|when)|not actually|did not)[^.\n]{0,100}(?:launch|execut|result|evidence|run)/i,
      'explicitly permits false delegation claims',
    ],
    [
      /(?:independent agent|subagent|delegation)[^.\n]{0,100}(?:was|were)?[^.\n]{0,40}(?:not launched|not executed|not run)[^.\n]{0,100}(?:claim|state)/i,
      'explicitly permits false delegation claims',
    ],
  ]);
}

const issueTracker = read('ai/core/issue-tracker.md');
const jiraPointer = read('ai/rules/jira-and-branch.md');
if (!issueTracker.includes('Do not invent ticket details')) fail('issue tracker missing: Do not invent ticket details');
if (!issueTracker.includes('ai/project/profile.json')) fail('issue tracker does not read the project profile');
if (!issueTracker.includes('A missing story URL or ticket ID is not, by itself, a reason to skip branch preparation')) {
  fail('issue tracker still skips branch preparation when no ticket is supplied');
}
if (!issueTracker.includes('Do not claim that a branch was created or checked out unless the Git command ran')) {
  fail('issue tracker missing verified branch-creation evidence rule');
}
if (!issueTracker.includes('feat/<project-name>/<short-description>')) {
  fail('issue tracker missing path-segment ticketless branch fallback');
}
if (!issueTracker.includes('branch.base')) fail('issue tracker missing the profile base-branch field');
if (!jiraPointer.includes('ai/core/issue-tracker.md')) fail('jira pointer is stale');
for (const phrase of ['git checkout dev', 'git pull origin dev', 'fix/vdx-<number>', 'feat/vdx-<number>']) {
  if (issueTracker.includes(phrase) || jiraPointer.includes(phrase)) {
    fail('issue tracker hardcodes a repository branch command or ticket prefix: ' + phrase);
  }
}

const gitDelivery = read('ai/rules/git-and-delivery.md');
const approvalQuestion = 'Do you approve these commit groups and messages?';
const approvalBeforeStaging = 'Wait for explicit approval before staging or committing.';
const groupSpecificApproval = 'Approval is group-specific and non-transferable';
const explicitPathStaging = 'Stage only the exact approved paths. Never use `git add .` or `git add -A`.';
const noPushWithoutApproval = 'Push only after separate explicit approval; commit approval never authorizes a push.';
const logicalGrouping = 'Group by logical purpose first and folder second.';
const profileCommitPointer =
  'Every proposed and created commit must follow the convention in `ai/project/profile.json`';

for (const [contract, message] of [
  [approvalQuestion, 'approval question'],
  [approvalBeforeStaging, 'approval-before-staging gate'],
  [groupSpecificApproval, 'group-specific approval rule'],
  [explicitPathStaging, 'explicit-path staging rule'],
  [noPushWithoutApproval, 'separate push approval rule'],
  [profileCommitPointer, 'project profile commit convention'],
  [logicalGrouping, 'logical grouping rule'],
  [
    'Do not claim a Git hook enforces this format unless the project profile records a verified hook.',
    'commit enforcement limitation',
  ],
]) {
  if (!gitDelivery.includes(contract)) fail('git delivery missing ' + message);
}

for (const phrase of [
  '**Group:**',
  '**Files:**',
  '**Title:**',
  '**Description:**',
  '**Verification:**',
  'exactly one blank-line separator',
  'actual ticket associated with the change',
  'Never invent a ticket.',
  'commits.ticketlessHeader',
  'A missing ticket ID must not disable logical commit grouping',
  'Never amend, reset, discard, overwrite, rewrite history, or force-push',
]) {
  if (!gitDelivery.includes(phrase)) fail('git delivery missing: ' + phrase);
}

rejectPatterns(gitDelivery.toLowerCase(), 'ai/rules/git-and-delivery.md', [
  [
    /approval (?:transfers|applies|extends) to[^.\n]{0,100}(?:other|future|unapproved) (?:groups?|commits?)/,
    'permits approval to transfer to other groups or commits',
  ],
  [
    /(?:git add \.|git add -a)[^.\n]{0,100}(?:is allowed|is permitted|may(?!\s+not)|can(?!not|\s+not)|must be used)/,
    'permits blind staging',
  ],
  [/commit approval (?:authorizes|includes|permits) (?:a )?push/, 'permits a push without separate approval'],
]);

rejectAffirmativeClauses(gitDelivery, 'ai/rules/git-and-delivery.md', [
  [
    /ambiguous approvals?(?: responses?)? (?:authorize|authorizes|approve|approves|cover|covers|apply|applies)(?: to)? (?:every|all|any)(?: of the)? proposed groups?/,
    'allows ambiguous approval to authorize proposed groups',
  ],
  [
    /(?:(?:\bmay\b(?!\s+(?:not|never)\b)|\bcan\b(?!['’]t\b|\s+(?:not|never)\b)|\b(?:is|are) allowed to\b|\b(?:is|are) permitted to\b)[^\n]{0,80}(?:stage|commit)[^\n]{0,100}(?:(?<!not )(?<!never )before|(?<!not )(?<!never )without)[^\n]{0,60}(?:explicit )?approval|(?:commits?|staging|committing)[^\n]{0,60}(?:\bmay\b(?!\s+(?:not|never)\b)|\bcan\b(?!['’]t\b|\s+(?:not|never)\b)|\b(?:is|are) allowed to\b|\b(?:is|are) permitted to\b)[^\n]{0,60}(?:be made|occur|happen|begin|proceed)?[^\n]{0,60}(?:(?<!not )(?<!never )before|(?<!not )(?<!never )without)[^\n]{0,60}(?:explicit )?approval)/,
    'permits staging or committing before explicit approval',
  ],
  [
    /(?:group (?:the )?files? by folder first|(?:\bshould\b(?!\s+(?:not|never)\b)|\bmust\b(?!\s+(?:not|never)\b)|\bmay\b(?!\s+(?:not|never)\b)|\bcan\b(?!['’]t\b|\s+(?:not|never)\b)) be grouped by folder first|files? (?:is|are) required to be grouped by folder first|folder(?: boundaries)? (?:take|takes|have|has) precedence over logical (?:change|purpose|grouping))/,
    'requires folder-first grouping instead of logical-purpose grouping',
  ],
  [
    /(?:create one commit per file|one commit per file (?:is (?:required|preferred|mandatory)|\bshould\b(?!\s+(?:not|never)\b)|\bmust\b(?!\s+(?:not|never)\b)|\bmay\b(?!\s+(?:not|never)\b)|\bcan\b(?!['’]t\b|\s+(?:not|never)\b)))/,
    'requires unnecessary per-file commit fragmentation',
  ],
]);

const lifecycleCommitSequence =
  'prepare logically coherent commit groups, validate complete commit titles and descriptions against the project profile, present exact files and actual verification evidence, and wait for explicit group-specific approval before staging or committing.';
if (!workflow.includes(lifecycleCommitSequence)) fail('lifecycle commit approval sequence missing');
if (!workflow.includes('After approval, commit only approved groups with explicit-path staging')) {
  fail('lifecycle approved-group execution sequence missing');
}

  const adapters = {
    'ai/templates/cursor/rules/project-context.mdc': 'ai/rules/project-context.md',
    'ai/templates/cursor/rules/angular-typescript.mdc': 'ai/profiles/angular-typescript.md',
    'ai/templates/cursor/rules/ui-html.mdc': 'ai/profiles/angular-html.md',
    'ai/templates/cursor/rules/ui-scss.mdc': 'ai/profiles/angular-scss.md',
    'ai/templates/cursor/rules/testing-and-quality.mdc': 'ai/rules/testing-and-quality.md',
    'ai/templates/cursor/rules/jira-and-branch-workflow.mdc': 'ai/core/issue-tracker.md',
    'ai/templates/cursor/rules/git-and-delivery.mdc': 'ai/rules/git-and-delivery.md',
    'ai/templates/cursor/rules/minimal-implementation.mdc': 'ai/rules/minimal-implementation.md',
    'ai/templates/cursor/rules/multi-agent-development-workflow.mdc': 'ai/core/lifecycle.md',
    'ai/templates/cursor/agents/implementer.md': 'ai/agents/implementer.md',
    'ai/templates/cursor/agents/code-reviewer.md': 'ai/agents/code-reviewer.md',
    'ai/templates/cursor/agents/test-engineer.md': 'ai/agents/test-engineer.md',
  };

  const alwaysApplyTrue = [
    'ai/templates/cursor/rules/project-context.mdc',
    'ai/templates/cursor/rules/jira-and-branch-workflow.mdc',
    'ai/templates/cursor/rules/git-and-delivery.mdc',
    'ai/templates/cursor/rules/minimal-implementation.mdc',
    'ai/templates/cursor/rules/multi-agent-development-workflow.mdc',
  ];

  const expectedGlobs = {
    'ai/templates/cursor/rules/angular-typescript.mdc': 'src/**/*.ts',
    'ai/templates/cursor/rules/ui-html.mdc': 'src/**/*.html',
    'ai/templates/cursor/rules/ui-scss.mdc': 'src/**/*.scss',
    'ai/templates/cursor/rules/testing-and-quality.mdc': '**/*.spec.ts',
  };

  const allowedFrontmatter = new Set([
  'description',
  'alwaysApply',
  'globs',
  'name',
  'model',
  'readonly',
  'is_background',
]);
const duplicatedCommands = ['git checkout dev', 'git pull origin dev', 'npm run build'];

for (const [adapter, target] of Object.entries(adapters)) {
  if (!fs.existsSync(path.join(root, adapter))) {
    fail('missing cursor template ' + adapter);
    continue;
  }
  const text = read(adapter);
  if (!text.includes(target)) fail(adapter + ' does not reference ' + target);
  const parsed = frontmatter(text, adapter);
  if (!parsed) continue;
  for (const key of Object.keys(parsed.fields)) {
    if (!allowedFrontmatter.has(key)) fail(adapter + ' bad key ' + key);
  }
  if (parsed.body.length > 1800) {
    fail(adapter + ' body is too long to be a thin adapter (' + parsed.body.length + ')');
  }
  for (const command of duplicatedCommands) {
    if (parsed.body.includes(command)) fail(adapter + ' duplicates authoritative command: ' + command);
  }
}

for (const file of alwaysApplyTrue) {
  if (!fs.existsSync(path.join(root, file))) continue;
  const parsed = frontmatter(read(file), file);
  if (parsed && parsed.fields.alwaysApply !== 'true') {
    fail(file + ' alwaysApply must be true');
  }
}

for (const [file, glob] of Object.entries(expectedGlobs)) {
  if (!fs.existsSync(path.join(root, file))) {
    fail('missing cursor rule ' + file);
    continue;
  }
  const parsed = frontmatter(read(file), file);
  if (parsed && parsed.fields.globs !== glob) {
    fail(file + ' glob must be ' + glob);
  }
}

const reviewer = frontmatter(
  read('ai/templates/cursor/agents/code-reviewer.md'),
  'ai/templates/cursor/agents/code-reviewer.md'
);
if (reviewer && reviewer.fields.readonly !== 'true') {
  fail('Cursor code-reviewer readonly must be true');
}

const agentsMd = read('AGENTS.md');
for (const phrase of ['ai/README.md', 'ai/core/lifecycle.md', 'Single-agent fallback']) {
  if (!agentsMd.includes(phrase)) fail('AGENTS.md missing ' + phrase);
}
if (agentsMd.length > 6000) fail('AGENTS.md is too large for the Codex default budget');

const ticketPointer = read('rules/ticket-branch.md');
if (!ticketPointer.includes('ai/rules/jira-and-branch.md')) fail('ticket-branch pointer is stale');
if (ticketPointer.includes('git checkout dev')) fail('ticket-branch still contains the branch procedure');

const tomlFiles = {
  '.codex/agents/implementer.toml': 'implementer',
  '.codex/agents/code-reviewer.toml': 'code-reviewer',
  '.codex/agents/test-engineer.toml': 'test-engineer',
};
for (const [file, name] of Object.entries(tomlFiles)) {
  const text = read(file);
  if (!text.includes('name = "' + name + '"')) fail(file + ' name mismatch');
  if (!text.includes('description = "')) fail(file + ' missing description');
  if (!text.includes('developer_instructions')) fail(file + ' missing developer_instructions');
  if (!text.includes('ai/agents/' + name + '.md')) fail(file + ' does not reference canonical role');
}
if (!read('.codex/agents/code-reviewer.toml').includes('sandbox_mode = "read-only"')) {
  fail('code-reviewer toml is not read-only');
}

const cursorAdapter = read('ai/adapters/cursor.md');
for (const phrase of ['getAccessibleAtlassianResources', 'getJiraIssue', 'subagent_type', 'Single-agent fallback']) {
  if (!cursorAdapter.includes(phrase)) fail('cursor adapter missing ' + phrase);
}

const scanRoots = ['ai', path.join('.cursor', 'rules'), path.join('.cursor', 'agents'), path.join('.codex', 'agents')];
const scanFiles = ['AGENTS.md', path.join('rules', 'ticket-branch.md')];
const patternExceptions = [];

function walk(relativeDir) {
  const absolute = path.join(root, relativeDir);
  if (!fs.existsSync(absolute)) return;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) walk(relative);
    else if (/\.(md|mdc|toml)$/.test(entry.name)) scanFiles.push(relative);
  }
}

for (const relativeDir of scanRoots) walk(relativeDir);

function aiTokens(text) {
  const tokens = [];
  const pattern = /`([^`\n]+)`/g;
  let match = pattern.exec(text);
  while (match) {
    const token = match[1].trim().replace(/[.,;:)]+$/g, '');
    if (token.startsWith('ai/')) tokens.push(token);
    match = pattern.exec(text);
  }
  return tokens;
}

const consumerOwnedAiPaths = new Set([
  'ai/project/profile.json',
  'ai/project/profile.md',
  'ai/install/conflict-report.json',
]);

for (const file of scanFiles) {
  if (!fs.existsSync(path.join(root, file))) continue;
  for (const token of aiTokens(read(file))) {
    if (/[*<>{}]|\.\.\./.test(token)) {
      patternExceptions.push(file + ': ' + token);
      continue;
    }
    if (consumerOwnedAiPaths.has(token) && !fs.existsSync(path.join(root, token))) {
      continue;
    }
    if (!fs.existsSync(path.join(root, token))) fail('missing ai path ' + token + ' referenced by ' + file);
  }
}

const profile = loadProfile(root);
const coreVersion = read('ai/CORE_VERSION').trim();
if (!profile) {
  console.log('KIT SOURCE MODE: no consumer profile; skipping project-profile checks');
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkgVersion = String(JSON.parse(read('package.json')).version ?? '').trim();
      if (pkgVersion && pkgVersion !== coreVersion) {
        fail('package.json version does not match ai/CORE_VERSION');
      }
    } catch (error) {
      fail('unable to read package.json version: ' + String(error.message ?? error));
    }
  }
} else {
  const version = coreVersion;
  if (profile.coreVersion !== version) fail('profile coreVersion does not match ai/CORE_VERSION');
  for (const key of ['project', 'packageManager', 'tickets', 'commits', 'branch', 'activeProfiles']) {
    if (profile[key] === undefined) fail('profile missing ' + key);
  }
  if (profile.tickets?.provider === undefined || profile.tickets?.required === undefined) {
    fail('profile missing tickets.provider or tickets.required');
  }
}

const forbiddenToken = [/vdx-\d+/i, /AFAQYIT/, /afaqy-vi/, /ngx-translate/, /git checkout dev/];
function scanForbidden(relative) {
  if (!fs.existsSync(path.join(root, relative))) return;
  const text = read(relative);
  for (const pattern of forbiddenToken) {
    if (pattern.test(text)) fail(relative + ' contains project-specific token ' + pattern);
  }
}
function walkForbidden(relativeDir) {
  const absolute = path.join(root, relativeDir);
  if (!fs.existsSync(absolute)) return;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) walkForbidden(relative);
    else if (/\.(md|mjs)$/.test(entry.name)) scanForbidden(relative);
  }
}
for (const relativeDir of ['ai/core', 'ai/agents', 'ai/adapters', 'ai/workflows']) walkForbidden(relativeDir);
for (const relative of [
  'ai/rules/git-and-delivery.md',
  'ai/rules/minimal-implementation.md',
  'ai/rules/jira-and-branch.md',
  'ai/rules/project-context.md',
  'ai/rules/testing-and-quality.md',
  'ai/rules/angular-typescript.md',
  'ai/rules/ui-html.md',
  'ai/rules/ui-scss.md',
  'ai/README.md',
]) {
  scanForbidden(relative);
}

if (patternExceptions.length > 0) {
  console.log('PATH EXCEPTIONS (placeholders, not files):');
  for (const item of patternExceptions) console.log('  ' + item);
} else {
  console.log('PATH EXCEPTIONS: none');
}

if (failed) process.exit(1);
console.log('VALIDATION OK');

if (process.argv.includes('--self-test')) {
  const fixtureParent = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-policy-validation-'));
  const fixtureInputs = ['ai', '.cursor', '.codex', 'rules', 'AGENTS.md'];
  const messageCases = [
    {
      name: 'valid-conventional-message',
      message: 'docs(workflow, tkt-2789): add approval gate\n\nDocument the required approval workflow.',
      expected: 0,
    },
    {
      name: 'valid-breaking-bang',
      message: 'feat(api, tkt-3001)!: replace inspection response\n\nReplace the response contract for the new API.',
      expected: 0,
    },
    {
      name: 'valid-breaking-footer',
      message:
        'refactor(inspection, tkt-3001): reshape inspection state\n\nReshape stored inspection state.\n\nBREAKING CHANGE: Consumers must read the new state shape.',
      expected: 0,
    },
    {
      name: 'invalid-malformed-header',
      message: 'docs workflow tkt-2789 add approval gate\n\nDocument the gate.',
      expected: 1,
    },
    {
      name: 'invalid-missing-scope',
      message: 'docs(tkt-2789): add approval gate\n\nDocument the gate.',
      expected: 1,
      options: { hasTicket: true },
    },
    {
      name: 'invalid-missing-jira',
      message: 'docs(workflow): add approval gate\n\nDocument the gate.',
      expected: 1,
      options: { hasTicket: true },
    },
    {
      name: 'valid-ticketless-fallback',
      message: 'docs(workflow): add approval gate\n\nDocument the gate.',
      expected: 0,
      options: { hasTicket: false },
    },
    {
      name: 'invalid-type',
      message: 'change(workflow, tkt-2789): add approval gate\n\nDocument the gate.',
      expected: 1,
    },
    {
      name: 'invalid-uppercase-ticket',
      message: 'docs(workflow, TKT-2789): add approval gate\n\nDocument the gate.',
      expected: 1,
    },
    {
      name: 'invalid-missing-blank-line',
      message: 'docs(workflow, tkt-2789): add approval gate\nDocument the gate.',
      expected: 1,
    },
    {
      name: 'invalid-missing-description',
      message: 'docs(workflow, tkt-2789): add approval gate\n\n',
      expected: 1,
    },
    {
      name: 'invalid-extra-blank-before-description',
      message: 'docs(workflow, tkt-2789): add approval gate\n\n\nDocument the gate.',
      expected: 1,
    },
    {
      name: 'invalid-lowercase-breaking-footer',
      message:
        'feat(api, tkt-3001): replace response\n\nReplace the response.\n\nbreaking change: Consumers must update.',
      expected: 1,
    },
  ];
  const cases = [
    {
      name: 'valid-baseline-and-applicability-contracts',
      expected: 0,
    },
    {
      name: 'reviewer-pass-with-open-a',
      expected: 1,
      file: 'ai/agents/code-reviewer.md',
      append: '\nThe reviewer may return PASS with an open category A finding.\n',
    },
    {
      name: 'reviewer-pass-with-open-b',
      expected: 1,
      file: 'ai/agents/code-reviewer.md',
      append: '\nThe reviewer may return PASS with an open category B finding.\n',
    },
    {
      name: 'ready-with-mandatory-not-run',
      expected: 1,
      file: 'ai/core/lifecycle.md',
      append: '\nREADY FOR QA is allowed with a mandatory check marked NOT RUN.\n',
    },
    {
      name: 'adapter-overrides-final-status',
      expected: 1,
      file: 'ai/adapters/generic.md',
      append: '\nThis adapter overrides the canonical final status and may return READY FOR QA with weaker criteria.\n',
    },
    {
      name: 'passed-without-execution',
      expected: 1,
      file: 'ai/agents/test-engineer.md',
      append: '\nThe Test Engineer may report PASSED without execution evidence.\n',
    },
    {
      name: 'baseline-evidence-contract-missing',
      expected: 1,
      file: 'ai/agents/test-engineer.md',
      replace: [baselineEvidenceContract, 'Baseline evidence is optional.'],
    },
    {
      name: 'false-pre-existing-without-baseline',
      expected: 1,
      file: 'ai/agents/test-engineer.md',
      append: '\nA failed check may be classified as pre-existing without baseline evidence.\n',
    },
    {
      name: 'non-destructive-baseline-contract-missing',
      expected: 1,
      file: 'ai/agents/test-engineer.md',
      replace: [baselineWorkingTreeContract, 'Baseline collection has no working-tree constraints.'],
    },
    {
      name: 'destructive-baseline-collection-allowed',
      expected: 1,
      file: 'ai/agents/test-engineer.md',
      append: '\nBaseline evidence may reset, stash, or discard the working tree.\n',
    },
    {
      name: 'non-destructive-baseline-strengthening-language',
      expected: 0,
      file: 'ai/agents/test-engineer.md',
      append:
        '\nBaseline evidence may not reset or stash the working tree and cannot discard user changes. A failed check may not be classified as pre-existing without baseline evidence.\n',
    },
    {
      name: 'not-applicable-contract-missing',
      expected: 1,
      file: 'ai/rules/testing-and-quality.md',
      replace: [notApplicableContract, '`NOT APPLICABLE` is an alias for `PASSED`.'],
    },
    {
      name: 'not-applicable-counts-as-passed',
      expected: 1,
      file: 'ai/core/lifecycle.md',
      append: '\n`NOT APPLICABLE` counts as `PASSED`.\n',
    },
    {
      name: 'mandatory-applicable-may-be-not-applicable',
      expected: 1,
      file: 'ai/core/lifecycle.md',
      append: '\nA mandatory applicable check may be marked `NOT APPLICABLE`.\n',
    },
    {
      name: 'not-applicable-can-satisfy-mandatory',
      expected: 1,
      file: 'ai/core/lifecycle.md',
      append: '\n`NOT APPLICABLE` can satisfy a mandatory applicable check.\n',
    },
    {
      name: 'not-applicable-aliases-not-run',
      expected: 1,
      file: 'ai/core/lifecycle.md',
      append: '\n`NOT APPLICABLE` is equivalent to `NOT RUN`.\n',
    },
    {
      name: 'not-applicable-aliases-blocked',
      expected: 1,
      file: 'ai/core/lifecycle.md',
      append: '\n`NOT APPLICABLE` is treated as `BLOCKED`.\n',
    },
    {
      name: 'not-applicable-blocks-readiness',
      expected: 1,
      file: 'ai/core/lifecycle.md',
      append: '\n`NOT APPLICABLE` blocks `READY FOR QA`.\n',
    },
    {
      name: 'not-applicable-distinction-strengthening-language',
      expected: 0,
      file: 'ai/core/lifecycle.md',
      append:
        '\nA mandatory applicable check may not be marked `NOT APPLICABLE`. `NOT APPLICABLE` cannot satisfy a mandatory applicable check. `NOT APPLICABLE` is not equivalent to `NOT RUN` or `BLOCKED`. `NOT APPLICABLE` never blocks `READY FOR QA`.\n',
    },
    {
      name: 'final-report-evidence-contract-missing',
      expected: 1,
      file: 'ai/core/lifecycle.md',
      replace: [
        finalReportEvidenceContract,
        'Final reports may omit exact commands, exit codes, and concise failure evidence.',
      ],
    },
    {
      name: 'final-report-evidence-may-be-omitted',
      expected: 1,
      file: 'ai/core/lifecycle.md',
      append: '\nFinal reports may omit exact commands, exit codes, and concise failure evidence.\n',
    },
    {
      name: 'translation-rendering-distinction-missing',
      expected: 1,
      file: 'ai/core/lifecycle.md',
      replace: [
        'Translation or data assertions verify values, not rendered UI',
        'Translation or data assertions prove rendered UI and RTL behavior',
      ],
    },
    {
      name: 'translation-assertions-falsely-prove-rendering',
      expected: 1,
      file: 'ai/core/lifecycle.md',
      append: '\nTranslation or data assertions prove rendered UI and RTL behavior.\n',
    },
    {
      name: 'negated-policy-strengthening-language',
      expected: 0,
      file: 'ai/core/lifecycle.md',
      append:
        '\nFinal reports may not omit exact commands. Final reports cannot omit exit codes. Translation or data assertions do not prove rendered UI. Translation or data assertions cannot guarantee RTL behavior.\n',
    },
    {
      name: 'false-delegation-claim',
      expected: 1,
      file: 'ai/agents/implementer.md',
      append:
        '\nClaim that an independent subagent ran even when it was not executed and returned no result evidence.\n',
    },
    {
      name: 'approval-before-staging-contract-missing',
      expected: 1,
      file: 'ai/rules/git-and-delivery.md',
      replace: [approvalBeforeStaging, 'Staging may occur before explicit approval.'],
    },
    {
      name: 'noun-first-early-staging-contradiction',
      expected: 1,
      file: 'ai/rules/git-and-delivery.md',
      append: '\nStaging may occur before explicit approval.\n',
    },
    {
      name: 'staging-without-approval-contradiction',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md permits staging or committing before explicit approval',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAn agent may stage without explicit approval.\n',
    },
    {
      name: 'mixed-clause-early-staging-contradiction',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md permits staging or committing before explicit approval',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nDo not stage unrelated files, but committing may occur before explicit approval.\n',
    },
    {
      name: 'qualified-early-staging-contradiction-with-later-negation',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md permits staging or committing before explicit approval',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nStaging may occur before explicit approval if the tree is not dirty.\n',
    },
    {
      name: 'passive-allowed-early-staging-contradiction',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md permits staging or committing before explicit approval',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAgents are allowed to stage before explicit approval.\n',
    },
    {
      name: 'passive-commit-early-staging-contradiction',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md permits staging or committing before explicit approval',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nCommits can be made before explicit approval.\n',
    },
    {
      name: 'unrelated-negative-clause-early-staging-contradiction',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md permits staging or committing before explicit approval',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAgents that do not own the files may stage before explicit approval.\n',
    },
    {
      name: 'group-specific-approval-contract-missing',
      expected: 1,
      file: 'ai/rules/git-and-delivery.md',
      replace: [groupSpecificApproval, 'Approval applies to other future groups'],
    },
    {
      name: 'ambiguous-approval-authorizes-all-groups',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md allows ambiguous approval to authorize proposed groups',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAn ambiguous approval response authorizes every proposed group.\n',
    },
    {
      name: 'ambiguous-approval-authorizes-all-of-the-groups',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md allows ambiguous approval to authorize proposed groups',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAn ambiguous approval response authorizes all of the proposed groups.\n',
    },
    {
      name: 'plural-ambiguous-approval-authorizes-all-groups',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md allows ambiguous approval to authorize proposed groups',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAmbiguous approval responses authorize all proposed groups.\n',
    },
    {
      name: 'ambiguous-approval-noun-authorizes-all-groups',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md allows ambiguous approval to authorize proposed groups',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAn ambiguous approval authorizes all proposed groups.\n',
    },
    {
      name: 'ambiguous-approval-noun-authorizes-all-of-the-groups',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md allows ambiguous approval to authorize proposed groups',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAn ambiguous approval authorizes all of the proposed groups.\n',
    },
    {
      name: 'plural-ambiguous-approvals-authorize-every-group',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md allows ambiguous approval to authorize proposed groups',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAmbiguous approvals authorize every proposed group.\n',
    },
    {
      name: 'plural-ambiguous-approvals-authorize-all-groups',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md allows ambiguous approval to authorize proposed groups',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAmbiguous approvals authorize all proposed groups.\n',
    },
    {
      name: 'plural-ambiguous-approvals-authorize-all-of-the-groups',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md allows ambiguous approval to authorize proposed groups',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAmbiguous approvals authorize all of the proposed groups.\n',
    },
    {
      name: 'explicit-path-staging-contract-missing',
      expected: 1,
      file: 'ai/rules/git-and-delivery.md',
      replace: [explicitPathStaging, '`git add .` may be used for convenience.'],
    },
    {
      name: 'separate-push-approval-contract-missing',
      expected: 1,
      file: 'ai/rules/git-and-delivery.md',
      replace: [noPushWithoutApproval, 'Commit approval authorizes a push.'],
    },
    {
      name: 'adapter-git-pointer-missing',
      expected: 1,
      file: 'ai/adapters/codex.md',
      replace: ['ai/rules/git-and-delivery.md', 'the local Git rule'],
    },
    {
      name: 'adapter-hard-lock-limitation-missing',
      expected: 1,
      file: 'ai/adapters/cursor.md',
      replace: [
        'Cursor has no platform hard-lock that guarantees approval before staging or committing',
        'Cursor automatically guarantees approval before staging or committing',
      ],
    },
    {
      name: 'adapter-false-automatic-approval-enforcement',
      expected: 1,
      file: 'ai/adapters/codex.md',
      append: '\nCodex automatically guarantees approval before staging or committing.\n',
    },
    {
      name: 'logical-grouping-contract-missing',
      expected: 1,
      file: 'ai/rules/git-and-delivery.md',
      replace: [logicalGrouping, 'Group files using any convenient order.'],
    },
    {
      name: 'folder-first-grouping-contradiction',
      expected: 1,
      file: 'ai/rules/git-and-delivery.md',
      append: '\nGroup files by folder first even when their logical purposes differ.\n',
    },
    {
      name: 'mixed-clause-folder-first-grouping-contradiction',
      expected: 1,
      expectedFailure:
        'FAIL ai/rules/git-and-delivery.md requires folder-first grouping instead of logical-purpose grouping',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nDo not split related tests, but group files by folder first.\n',
    },
    {
      name: 'passive-required-folder-first-grouping-contradiction',
      expected: 1,
      expectedFailure:
        'FAIL ai/rules/git-and-delivery.md requires folder-first grouping instead of logical-purpose grouping',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nFiles are required to be grouped by folder first.\n',
    },
    {
      name: 'per-file-grouping-contradiction',
      expected: 1,
      file: 'ai/rules/git-and-delivery.md',
      append: '\nCreate one commit per file.\n',
    },
    {
      name: 'mixed-clause-per-file-grouping-contradiction',
      expected: 1,
      expectedFailure: 'FAIL ai/rules/git-and-delivery.md requires unnecessary per-file commit fragmentation',
      file: 'ai/rules/git-and-delivery.md',
      append: '\nNever combine unrelated changes; create one commit per file.\n',
    },
    {
      name: 'after-approval-with-negated-before-relation',
      expected: 0,
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAn agent may stage after approval, not before explicit approval.\n',
    },
    {
      name: 'only-after-approval-with-never-before-relation',
      expected: 0,
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAn agent may stage only after approval and never before explicit approval.\n',
    },
    {
      name: 'only-with-approval-with-never-without-relation',
      expected: 0,
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAn agent may stage only with approval and never without explicit approval.\n',
    },
    {
      name: 'only-with-approval-with-negated-without-relation',
      expected: 0,
      file: 'ai/rules/git-and-delivery.md',
      append: '\nAn agent may stage only with approval, not without explicit approval.\n',
    },
    {
      name: 'approval-safety-strengthening-language',
      expected: 0,
      file: 'ai/rules/git-and-delivery.md',
      append:
        "\nAgents may not stage or commit before explicit approval. Agents cannot stage before explicit approval. Agents can't stage before explicit approval. No agent may stage before explicit approval. Staging may not occur before explicit approval. Staging may never occur before explicit approval. Approval does not transfer to future groups. `git add .` may not be used. Commit approval does not authorize a push.\n",
    },
    {
      name: 'ambiguous-approval-strengthening-language',
      expected: 0,
      file: 'ai/rules/git-and-delivery.md',
      append:
        '\nAn ambiguous approval response does not authorize any proposed group. Ambiguous responses require clarification before any group is approved.\n',
    },
    {
      name: 'no-ambiguous-approval-authorizes-groups',
      expected: 0,
      file: 'ai/rules/git-and-delivery.md',
      append: '\nNo ambiguous approval response authorizes any proposed group.\n',
    },
    {
      name: 'ambiguous-approval-noun-negation-variants',
      expected: 0,
      file: 'ai/rules/git-and-delivery.md',
      append:
        '\nNo ambiguous approval authorizes any proposed group. An ambiguous approval does not authorize all proposed groups. Ambiguous approvals do not authorize all of the proposed groups.\n',
    },
    {
      name: 'logical-grouping-strengthening-language',
      expected: 0,
      file: 'ai/rules/git-and-delivery.md',
      append:
        "\nDo not group files by folder first. Do not ever group files by folder first. Files should not be grouped by folder first. No files may be grouped by folder first. Never create one commit per file when related files form one logical change. Never ever create one commit per file. One commit per file is not required. One commit per file cannot be required. One commit per file can't be required.\n",
    },
  ];

  let selfTestFailed = false;
  try {
    const messageProfile = {
      commits: {
        convention: 'conventional-commits',
        headerPattern: '^([a-z]+)\\(([^(),\\n]+), (tkt-\\d+)\\)(!)?: (\\S.*)$',
        ticketlessHeaderPattern: '^([a-z]+)\\(([^(),\\n]+)\\)(!)?: (\\S.*)$',
        bodyRequired: true,
        types: ['feat', 'fix', 'docs', 'test', 'refactor', 'perf', 'build', 'ci', 'style', 'chore', 'revert'],
      },
    };
    for (const testCase of messageCases) {
      const actual = validateCommitMessage(testCase.message, messageProfile, testCase.options).length === 0 ? 0 : 1;
      const passed = actual === testCase.expected;
      console.log(
        'MESSAGE-TEST',
        testCase.name,
        'EXPECTED=' + testCase.expected,
        'ACTUAL=' + actual,
        passed ? 'PASS' : 'FAIL'
      );
      if (!passed) selfTestFailed = true;
    }
    for (const testCase of cases) {
      const fixtureRoot = path.join(fixtureParent, testCase.name);
      fs.mkdirSync(fixtureRoot);
      for (const input of fixtureInputs) {
        const source = path.join(root, input);
        if (!fs.existsSync(source)) continue;
        fs.cpSync(source, path.join(fixtureRoot, input), { recursive: true });
      }
      if (testCase.file) {
        const fixtureFile = path.join(fixtureRoot, testCase.file);
        if (testCase.replace) {
          const [search, replacement] = testCase.replace;
          const fixtureText = fs.readFileSync(fixtureFile, 'utf8');
          if (!fixtureText.includes(search)) {
            throw new Error('self-test replacement source missing for ' + testCase.name);
          }
          fs.writeFileSync(fixtureFile, fixtureText.replace(search, replacement));
        }
        if (testCase.append) fs.appendFileSync(fixtureFile, testCase.append);
      }

      const result = spawnSync(process.execPath, [path.join('ai', 'validate.mjs')], {
        cwd: fixtureRoot,
        encoding: 'utf8',
      });
      const actual = result.status ?? 1;
      const fixtureOutput = result.stdout + result.stderr;
      const passed =
        actual === testCase.expected && (!testCase.expectedFailure || fixtureOutput.includes(testCase.expectedFailure));
      console.log(
        'SELF-TEST',
        testCase.name,
        'EXPECTED=' + testCase.expected,
        'ACTUAL=' + actual,
        passed ? 'PASS' : 'FAIL'
      );
      const relevant = fixtureOutput.split(/\r?\n/).find((line) => line.startsWith('FAIL '));
      if (relevant) console.log('  ' + relevant);
      if (!passed) selfTestFailed = true;
    }
    if (runPortabilitySelfTest(root)) selfTestFailed = true;
  } finally {
    fs.rmSync(fixtureParent, { recursive: true, force: true });
    console.log('SELF-TEST FIXTURES CLEANED');
  }

  if (selfTestFailed) process.exit(1);
}
