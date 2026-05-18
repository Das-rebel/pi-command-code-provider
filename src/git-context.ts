/**
 * Git context resolution for the Command Code provider.
 *
 * Uses `git` CLI via execSync with a 5-second timeout to extract repo metadata
 * that gets embedded in the upstream request config block.
 */

import { execSync } from "node:child_process";

import type { GitContext } from "./types.js";

const GIT_TIMEOUT_MS = 5000;

const MAIN_BRANCH_CANDIDATES = ["main", "master"];

function runGit(args: string, cwd: string): string | null {
  try {
    return execSync(`git ${args}`, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function detectMainBranch(cwd: string): string {
  // Check remote HEAD symbolic ref first
  const remoteHead = runGit("symbolic-ref refs/remotes/origin/HEAD", cwd);
  if (remoteHead) {
    for (const candidate of MAIN_BRANCH_CANDIDATES) {
      if (remoteHead.endsWith(`/${candidate}`)) return candidate;
    }
  }

  // Check if branches exist locally
  const branches = runGit("branch --list", cwd);
  if (branches) {
    for (const candidate of MAIN_BRANCH_CANDIDATES) {
      if (branches.split("\n").some((b) => b.trim().replace(/^\* /, "") === candidate)) {
        return candidate;
      }
    }
  }

  return "main";
}

function parseStatus(raw: string | null): string {
  if (!raw) return "";
  const lines = raw.trim().split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return "clean";
  return lines.join("\n");
}

function parseRecentCommits(raw: string | null): Array<{ hash: string; message: string }> {
  if (!raw) return [];
  return raw
    .split("\n")
    .filter((line) => line.includes("|"))
    .map((line) => {
      const separator = line.indexOf("|");
      return {
        hash: line.slice(0, separator).trim(),
        message: line.slice(separator + 1).trim(),
      };
    })
    .filter((entry) => entry.hash.length > 0);
}

/**
 * Resolve git context for the given working directory.
 *
 * Returns a GitContext object. If `cwd` is not provided or the directory is
 * not inside a git repository, all fields default to safe empty values.
 */
export function resolveGitContext(cwd?: string): GitContext {
  const workingDir = cwd ?? process.cwd();

  const isInsideWorkTree = runGit("rev-parse --is-inside-work-tree", workingDir);
  if (isInsideWorkTree !== "true") {
    return {
      isGitRepo: false,
      currentBranch: "",
      mainBranch: "main",
      gitStatus: "",
      recentCommits: [],
      structure: [],
    };
  }

  const currentBranch = runGit("rev-parse --abbrev-ref HEAD", workingDir) ?? "";
  const mainBranch = detectMainBranch(workingDir);
  const rawStatus = runGit("status --porcelain", workingDir);
  const rawLog = runGit("log --oneline -10 --pretty=format:%h|%s", workingDir);

  return {
    isGitRepo: true,
    currentBranch,
    mainBranch,
    gitStatus: parseStatus(rawStatus),
    recentCommits: parseRecentCommits(rawLog),
    structure: [],
  };
}
