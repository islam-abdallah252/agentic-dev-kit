import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

var EDIT = new Set(["Write", "StrReplace", "Delete", "EditNotebook", "ApplyPatch", "Edit"]);

function out(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function deny(message) {
  out({ permission: "deny", user_message: message, agent_message: message });
}

function allow() {
  out({ permission: "allow" });
}

function readInput() {
  var raw = fs.readFileSync(0, "utf8");
  if (!raw.trim()) return null;
  try {
    var payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}

function root() {
  return process.env.CURSOR_PROJECT_DIR || process.cwd();
}

function loadBase(dir) {
  try {
    var profile = JSON.parse(fs.readFileSync(path.join(dir, "ai", "project", "profile.json"), "utf8"));
    var base = profile && profile.branch ? profile.branch.base : "";
    if (typeof base !== "string" || base.trim() === "" || base === "unknown") return null;
    if (base === "none") return base;
    execFileSync("git", ["check-ref-format", "--branch", base], { stdio: "ignore" });
    return base;
  } catch {
    return null;
  }
}

function currentBranch(dir) {
  try {
    var branch = execFileSync("git", ["branch", "--show-current"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return branch || null;
  } catch {
    return null;
  }
}

function isPublish(command) {
  var parts = command.split(/&&|\|\||;|\n|\|/);
  var i;
  for (i = 0; i < parts.length; i = i + 1) {
    var segment = parts[i].trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S* +)+/, "");
    if (/^git(?: +-C +\S+| +--git-dir(?:=\S*| +\S+)| +--work-tree(?:=\S*| +\S+)| +-c +\S+)* +push(?: |$)/.test(segment)) return true;
  }
  return false;
}

function commandOf(payload) {
  if (typeof payload.command === "string") return payload.command;
  if (payload.tool_input && typeof payload.tool_input.command === "string") return payload.tool_input.command;
  return "";
}

var READ_ONLY_GIT = {
  status: true,
  diff: true,
  log: true,
  show: true,
  blame: true,
  "rev-parse": true,
  "ls-files": true,
  "ls-tree": true,
  "cat-file": true,
  describe: true,
  shortlog: true,
  grep: true,
  "check-ignore": true,
  "check-ref-format": true,
  version: true,
  help: true,
};

var READ_ONLY_BIN = {
  ls: true,
  cat: true,
  pwd: true,
  echo: true,
  printf: true,
  head: true,
  tail: true,
  wc: true,
  which: true,
  true: true,
};

function hasFileRedirect(command) {
  var stripped = command.replace(/\d*>&[12]/g, "").replace(/[12]>&\d+/g, "");
  return stripped.indexOf(">") !== -1;
}

function gitSubcommand(tokens) {
  var i = 1;
  while (i < tokens.length) {
    var token = tokens[i];
    if (token === "-C" || token === "--git-dir" || token === "--work-tree" || token === "-c") {
      i = i + 2;
      continue;
    }
    if (token.indexOf("-") === 0) {
      i = i + 1;
      continue;
    }
    return { name: token, args: tokens.slice(i + 1) };
  }
  return null;
}

function isReadOnlyGitBranch(args) {
  var listed = false;
  var i;
  for (i = 0; i < args.length; i = i + 1) {
    var arg = args[i];
    if (arg === "--list" || arg === "--show-current" || arg === "-a" || arg === "-r" || arg === "-v" || arg === "-vv") {
      if (arg === "--list" || arg === "--show-current") listed = true;
      continue;
    }
    if (
      arg === "-d" ||
      arg === "-D" ||
      arg === "-m" ||
      arg === "-M" ||
      arg === "-c" ||
      arg === "-C" ||
      arg === "-u" ||
      arg.indexOf("--delete") === 0 ||
      arg.indexOf("--move") === 0 ||
      arg.indexOf("--copy") === 0 ||
      arg.indexOf("--set-upstream") === 0
    ) {
      return false;
    }
    if (arg.indexOf("-") === 0 || arg === "--output" || arg.indexOf("--output=") === 0) return false;
    if (!listed) return false;
  }
  return true;
}

function isReadOnlyGitRemote(args) {
  if (args.length === 0) return true;
  var sub = args[0];
  return sub === "-v" || sub === "--verbose" || sub === "show" || sub === "get-url";
}

function isReadOnlySegment(segment) {
  var stripped = segment.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S* +)+/, "");
  var tokens = stripped.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  var bin = tokens[0].split("/").pop();
  if (READ_ONLY_BIN[bin]) return true;
  if (bin !== "git") return false;
  var sub = gitSubcommand(tokens);
  if (!sub) return false;
  var i;
  for (i = 0; i < sub.args.length; i = i + 1) {
    if (sub.args[i] === "--output" || sub.args[i].indexOf("--output=") === 0) return false;
  }
  if (READ_ONLY_GIT[sub.name]) return true;
  if (sub.name === "branch") return isReadOnlyGitBranch(sub.args);
  if (sub.name === "remote") return isReadOnlyGitRemote(sub.args);
  if (sub.name === "config") {
    var mode = sub.args[0];
    return mode === "--get" || mode === "--get-regexp" || mode === "--list" || mode === "-l";
  }
  return false;
}

function isReadOnlyCommand(command) {
  if (command.indexOf("`") !== -1 || command.indexOf("$(") !== -1 || hasFileRedirect(command)) return false;
  var parts = command.split(/&&|\|\||;|\n|\|/);
  if (parts.length === 0) return false;
  var i;
  for (i = 0; i < parts.length; i = i + 1) {
    var segment = parts[i].trim();
    if (!segment || !isReadOnlySegment(segment)) return false;
  }
  return true;
}

function decide(payload) {
  var event = payload.hook_event_name;
  var tool = payload.tool_name;
  var pre = event === "preToolUse" || (event == null && typeof tool === "string");
  var shell = event === "beforeShellExecution" || tool === "Shell" || (event == null && !pre && typeof payload.command === "string");
  if (!pre && !shell) return "malformed";
  if (pre && typeof tool !== "string") return "malformed";
  var command = commandOf(payload);
  if (shell && command.trim() === "") return "malformed";
  if (shell && isPublish(command)) return "publish";
  var base = loadBase(root());
  if (base == null) return "invalid-base";
  if (base === "none") return "allow";
  var branch = currentBranch(root());
  if (!branch) return "unknown-branch";
  var modifies = EDIT.has(tool) || (shell && !isReadOnlyCommand(command));
  if (branch === base && modifies) return "base-branch";
  return "allow";
}

var messages = {
  publish: "Push and other publish commands are blocked on every branch.",
  "invalid-base": "File modifications are blocked because the configured base branch is missing or invalid.",
  "unknown-branch": "File modifications are blocked because the current Git branch cannot be determined.",
  "base-branch": "File modifications are blocked on the base branch.",
  malformed: "The branch guard blocked this action because the hook input was missing or malformed.",
};

var payload = readInput();
var result = payload ? decide(payload) : "malformed";
if (result === "allow") allow();
else deny(messages[result] || messages.malformed);
