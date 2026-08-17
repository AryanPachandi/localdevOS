import type { Workspace } from "../workspace/workspace.js";
import type { TaskRoute } from "../models/model.js";
import { gitStatus, gitRemote } from "../tools/git.js";
import { runTests, runBuild } from "../tools/tests.js";
import { listFiles, searchFiles } from "../tools/filesystem.js";
import { executeShellCommand } from "../tools/shell.js";
import fs from "node:fs";
import path from "node:path";
import type { VerificationResult } from "../orchestrator/types.js";

export interface IndependentVerificationResult {
  status: "PASS" | "FAIL" | "PARTIAL";
  summary: string;
  evidence: string[];
  details?: Record<string, unknown>;
}

export async function runIndependentVerification(
  workspace: Workspace
): Promise<IndependentVerificationResult> {
  console.log(`🔍 Verifier: Performing independent inspection for workspace [${workspace.root}]...`);
  const evidence: string[] = [];
  let failCount = 0;
  let passCount = 0;

  // 1. Filesystem & Root Inspection
  const listRes = await listFiles(workspace, ".");
  if (listRes.ok && Array.isArray(listRes.data)) {
    passCount++;
    evidence.push(`Filesystem check: Workspace contains ${listRes.data.length} root entry/entries.`);
  } else {
    failCount++;
    evidence.push(`Filesystem check failed: Could not read workspace root.`);
  }

  // 2. Git Status & Remote Commit Matching Verification
  const statusRes = await gitStatus(workspace);
  if (statusRes.ok) {
    passCount++;
    const statusText = typeof statusRes.data === "string" ? statusRes.data : JSON.stringify(statusRes.data);
    evidence.push(`Git Status: ${statusText.split("\n")[0] || "Clean working tree"}`);

    // Verify git remote & commit match if repo exists
    const remoteRes = await gitRemote(workspace);
    if (remoteRes.ok && remoteRes.data) {
      evidence.push(`Git Remote Origin: ${remoteRes.data}`);

      const localHeadRes = await executeShellCommand(workspace, "git rev-parse HEAD");
      const remoteHeadRes = await executeShellCommand(workspace, "git rev-parse origin/main || git rev-parse origin/master");

      if (localHeadRes.ok && remoteHeadRes.ok) {
        const localHead = typeof localHeadRes.data === "string" ? localHeadRes.data.trim() : String((localHeadRes.data as any)?.stdout || "").trim();
        const remoteHead = typeof remoteHeadRes.data === "string" ? remoteHeadRes.data.trim() : String((remoteHeadRes.data as any)?.stdout || "").trim();

        if (localHead && remoteHead && localHead === remoteHead) {
          passCount++;
          evidence.push(`Git Commit Sync PASS: Local HEAD (${localHead.slice(0, 7)}) matches Remote (${remoteHead.slice(0, 7)})`);
        } else if (localHead && remoteHead) {
          failCount++;
          evidence.push(`Git Commit Sync WARNING: Local HEAD (${localHead.slice(0, 7)}) differs from Remote (${remoteHead.slice(0, 7)})`);
        }
      }
    }
  } else {
    evidence.push(`Git Status: Directory is not a Git repository (or Git unavailable).`);
  }

  // 3. Test & Build Verification if scripts exist in workspace
  if (workspace.context?.availableScripts?.test) {
    const testRes = await runTests(workspace);
    if (testRes.ok) {
      passCount++;
      evidence.push(`Test Suite Execution PASS: npm test returned exit code 0.`);
    } else {
      failCount++;
      evidence.push(`Test Suite Execution FAIL: npm test returned errors.`);
    }
  }

  if (workspace.context?.availableScripts?.build) {
    const buildRes = await runBuild(workspace);
    if (buildRes.ok) {
      passCount++;
      evidence.push(`Build Verification PASS: npm run build succeeded.`);
    } else {
      failCount++;
      evidence.push(`Build Verification FAIL: npm run build failed.`);
    }
  }

  // Final Status Determination
  let status: "PASS" | "FAIL" | "PARTIAL" = "PASS";
  if (failCount > 0 && passCount > 0) {
    status = "PARTIAL";
  } else if (failCount > 0 && passCount === 0) {
    status = "FAIL";
  }

  const summary = status === "PASS"
    ? `Independent Verification PASSED (${passCount} checks verified).`
    : status === "PARTIAL"
    ? `Independent Verification PARTIAL (${passCount} passed, ${failCount} failed).`
    : `Independent Verification FAILED (${failCount} checks failed).`;

  return {
    status,
    summary,
    evidence,
  };
}

export async function verifyTaskExecution(
  workspace: Workspace,
  route: TaskRoute,
  modelOutput: string
): Promise<{ verified: boolean; summary: string }> {
  const result = await runIndependentVerification(workspace);
  return {
    verified: result.status !== "FAIL",
    summary: `${result.summary}\n${result.evidence.join("\n")}`,
  };
}

/** Independent goal verifier. Model prose and a successful tool invocation are not evidence. */
export async function runGoalVerification(workspace: Workspace, goal: string, requireRemote = false): Promise<VerificationResult> {
  const base = await runIndependentVerification(workspace);
  const checks: VerificationResult["checks"] = [];
  const add = (name: string, passed: boolean, required: boolean, detail: string) => checks.push({ name, passed, required, detail });
  const packagePath = path.join(workspace.root, "package.json");
  const wantsApp = /react|app|todo|build|implement|create/.test(goal.toLowerCase());
  add("workspace exists", fs.existsSync(workspace.root), true, workspace.root);
  if (wantsApp) {
    add("package manifest", fs.existsSync(packagePath), true, "package.json must exist for an application goal");
    add("application source", ["src", "app"].some((dir) => fs.existsSync(path.join(workspace.root, dir))), true, "src/ or app/ must exist");
    if (/todo/.test(goal.toLowerCase())) {
      const search = await searchFiles(workspace, ".", "todo");
      add("TODO functionality evidence", search.ok && Array.isArray(search.data) && search.data.length > 0, true, "source must contain TODO-related implementation");
    }
  }
  add("independent build/tests", base.status === "PASS", true, base.summary);
  if (requireRemote) {
    const remote = await gitRemote(workspace); add("Git remote", remote.ok, true, remote.ok ? String(remote.data) : remote.error.message);
    const local = await executeShellCommand(workspace, "git rev-parse HEAD"); const remoteHead = await executeShellCommand(workspace, "git rev-parse origin/main || git rev-parse origin/master");
    add("remote matches local HEAD", local.ok && remoteHead.ok && local.data.trim() === remoteHead.data.trim(), true, "pushed commit must match local HEAD");
  }
  const failed = checks.filter((c) => c.required && !c.passed);
  return { status: failed.length ? (checks.some((c) => c.passed) ? "partial" : "failed") : "passed", checks, summary: failed.length ? `Goal verification failed: ${failed.map((c) => c.name).join(", ")}` : `Goal verification passed (${checks.length} independent checks).` };
}
