#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { discover } from './discover.mjs';
import { installerProfileDoc, skeletonProfile } from '../install/bootstrap.mjs';

function verifiedMap(report) {
  return new Map((report.verified ?? []).map((item) => [item.key, item]));
}

export function profileFromDiscovery(report, coreVersion) {
  const verified = verifiedMap(report);
  const conflictKeys = new Set((report.conflicts ?? []).map((item) => item.key));
  const profile = skeletonProfile(coreVersion);

  const name = verified.get('project.name');
  if (name) profile.project.name = name.value;

  const manager = verified.get('packageManager');
  if (manager && !conflictKeys.has('packageManager')) profile.packageManager = manager.value;

  const frameworks = verified.get('frameworks');
  if (frameworks) profile.frameworks = frameworks.value;

  const commands = {};
  for (const [key, item] of verified) {
    if (key.startsWith('commands.')) commands[key.slice('commands.'.length)] = item.value;
  }
  profile.commands = commands;
  profile.activeProfiles = [];
  return profile;
}

export function proposedProfiles(report) {
  const verified = verifiedMap(report);
  const frameworks = verified.get('frameworks')?.value ?? [];
  const manager = verified.get('packageManager')?.value;
  const proposed = [];
  if (frameworks.includes('angular')) {
    proposed.push({
      id: 'angular-typescript',
      evidence: 'verified frameworks include angular',
    });
  }
  if (
    (manager === 'npm' || manager === 'pnpm' || manager === 'yarn') &&
    !frameworks.includes('angular') &&
    !frameworks.includes('react')
  ) {
    proposed.push({
      id: 'node',
      evidence: 'verified Node package manager; confirm this is a Node service or library before activating',
    });
  }
  return proposed;
}

export function renderProfileMarkdown(profile, report) {
  const verified = verifiedMap(report);
  const filled = [];
  if (verified.has('project.name')) {
    filled.push('- `project.name`: `' + profile.project.name + '` (' + verified.get('project.name').evidence + ')');
  }
  if (profile.packageManager !== 'unknown' && verified.has('packageManager')) {
    filled.push('- `packageManager`: `' + profile.packageManager + '` (' + verified.get('packageManager').evidence + ')');
  }
  if (profile.frameworks) {
    filled.push('- `frameworks`: `' + JSON.stringify(profile.frameworks) + '` (' + verified.get('frameworks').evidence + ')');
  }
  for (const [name, command] of Object.entries(profile.commands ?? {})) {
    const item = verified.get('commands.' + name);
    filled.push('- `commands.' + name + '`: `' + command + '`' + (item ? ' (' + item.evidence + ')' : ''));
  }

  const unknown = [
    '- `project.type`',
    '- `tickets.provider`',
    '- `tickets.required`',
    '- `commits.convention`',
    '- `commits.ticketRequired`',
    '- `commits.headerPattern`',
    '- `branch.base`',
    '- `activeProfiles` (empty until you add a confirmed id)',
  ];
  if (profile.project.name === 'unknown') unknown.unshift('- `project.name`');
  if (profile.packageManager === 'unknown') unknown.unshift('- `packageManager`');

  const proposed = proposedProfiles(report);
  const proposedLines =
    proposed.length > 0
      ? proposed.map((item) => '- `' + item.id + '` — ' + item.evidence)
      : ['- none'];

  const inferred = (report.inferred ?? []).map(
    (item) => '- `' + item.key + '`: `' + JSON.stringify(item.value) + '` (' + item.evidence + '). Not copied into the profile.'
  );
  const conflicts = (report.conflicts ?? []).map(
    (item) => '- `' + item.key + '`: ' + (item.reason ?? 'conflicting evidence') + '. Left unresolved.'
  );

  return [
    '# Project profile',
    '',
    'Machine-readable values are in `ai/project/profile.json`.',
    '',
    'This file was generated from repository evidence. Review and edit it before use. Do not treat it as complete. Never copy an inferred tracker, base branch, commit convention, or technology profile into the JSON until you confirm it.',
    '',
    '## Filled from verified evidence',
    '',
    ...(filled.length > 0 ? filled : ['- none']),
    '',
    '## Left unknown or empty',
    '',
    ...unknown,
    '',
    '## Proposed technology profiles (not activated)',
    '',
    'Add an id to `activeProfiles` only after you confirm it applies. Then re-run the installer to write matching Cursor rules.',
    '',
    ...proposedLines,
    '',
    '## Inferred signals (not written into the JSON)',
    '',
    ...(inferred.length > 0 ? inferred : ['- none']),
    '',
    '## Conflicts',
    '',
    ...(conflicts.length > 0 ? conflicts : ['- none']),
    '',
  ].join('\n');
}

function readCoreVersion(root) {
  const file = path.join(root, 'ai', 'CORE_VERSION');
  if (!fs.existsSync(file)) return null;
  const version = fs.readFileSync(file, 'utf8').trim();
  return version || null;
}

export function isInstallerProfileJson(text, version) {
  try {
    return JSON.stringify(JSON.parse(text)) === JSON.stringify(skeletonProfile(version));
  } catch {
    return false;
  }
}

export function isInstallerProfileDoc(text) {
  return text.replace(/\r\n/g, '\n') === installerProfileDoc;
}

export function generateProfile({ root, overwrite = false, preview = false } = {}) {
  const version = readCoreVersion(root);
  if (!version) {
    return { ok: false, exit: 1, error: 'ai/CORE_VERSION is missing. Install the kit before generating a profile.' };
  }
  const report = discover(root);
  const profile = profileFromDiscovery(report, version);
  const markdown = renderProfileMarkdown(profile, report);
  const jsonText = JSON.stringify(profile, null, 2) + '\n';
  const jsonPath = path.join(root, 'ai', 'project', 'profile.json');
  const mdPath = path.join(root, 'ai', 'project', 'profile.md');
  const jsonExists = fs.existsSync(jsonPath);
  const mdExists = fs.existsSync(mdPath);
  const jsonCurrent = jsonExists ? fs.readFileSync(jsonPath, 'utf8') : '';
  const mdCurrent = mdExists ? fs.readFileSync(mdPath, 'utf8') : '';
  const jsonIsStub = !jsonExists || isInstallerProfileJson(jsonCurrent, version);
  const mdIsStub = !mdExists || isInstallerProfileDoc(mdCurrent);
  const blocked = (jsonExists && !jsonIsStub) || (mdExists && !mdIsStub);

  const result = {
    ok: true,
    profile,
    markdown,
    proposedProfiles: proposedProfiles(report),
    report,
    jsonPath,
    mdPath,
    blocked,
  };

  if (preview) {
    return { ...result, wrote: false, exit: 0 };
  }
  if (blocked && !overwrite) {
    return {
      ...result,
      ok: false,
      wrote: false,
      exit: 2,
      error:
        'ai/project/profile.json or profile.md already exists and is not the installer stub. Re-run with --preview to inspect, or --overwrite to replace the files.',
    };
  }

  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, jsonText);
  fs.writeFileSync(mdPath, markdown);
  return { ...result, wrote: true, exit: 0 };
}

function main() {
  const rootFlag = process.argv.indexOf('--root');
  const root = rootFlag >= 0 ? path.resolve(process.argv[rootFlag + 1]) : process.cwd();
  const overwrite = process.argv.includes('--overwrite');
  const preview = process.argv.includes('--preview');
  const result = generateProfile({ root, overwrite, preview });
  if (result.error) console.error(result.error);
  console.log(JSON.stringify({ profile: result.profile, proposedProfiles: result.proposedProfiles, wrote: result.wrote, blocked: result.blocked }, null, 2));
  if (preview && result.markdown) {
    console.log('--- profile.md ---\n' + result.markdown);
  }
  process.exit(result.exit ?? 1);
}

const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (process.argv.includes('--cli') || invokedDirectly) {
  main();
}
