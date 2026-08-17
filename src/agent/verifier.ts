import type { Workspace } from "../workspace/workspace.js";
import type { TaskRoute } from "../models/model.js";
import { gitStatus, gitDiff } from "../tools/git.js";
import { runTests } from "../tools/tests.js";

export interface VerificationResult {
  verified: boolean;
  summary: string;
  testPassed?: boolean;
  modifiedFiles?: string[];
  details?: Record<string, unknown>;
}

export async function verifyTaskExecution(
  workspace: Workspace,
  route: TaskRoute,
  modelOutput: string
): Promise<VerificationResult> {
  // Only execute post-task verification for coding/testing/refactoring tasks
  if (route.taskType !== "coding" && route.taskType !== "testing" && route.taskType !== "review") {
    return {
      verified: true,
      summary: "Task complete (Verification skipped for non-coding task).",
    };
  }

  console.log("🔍 Verifier: Inspecting execution results...");

  const results: Record<string, unknown> = {};
  let testPassed = true;
  let modifiedFiles: string[] = [];

  try {
    // 1. Inspect Git status to verify modified files
    const statusRes = await gitStatus(workspace);
    if (statusRes.ok && statusRes.data) {
      modifiedFiles = statusRes.data
        .split("\n")
        .filter((line) => line.includes("modified:"))
        .map((line) => line.replace("modified:", "").trim());
      results.modifiedFiles = modifiedFiles;
      results.rawStatus = statusRes.data;
    }

    // 2. If prompt or route involved tests, run actual test suite verification
    if (route.taskType === "testing" || modelOutput.toLowerCase().includes("test")) {
      const testRes = await runTests(workspace);
      if (testRes.ok) {
        results.tests = testRes.data;
        testPassed = true;
      } else {
        results.tests = testRes.error;
        testPassed = false;
      }
    }

    const summary = testPassed
      ? `Verification Succeeded: ${modifiedFiles.length} file(s) modified.`
      : `Verification Warning: Actual test execution returned failure.`;

    return {
      verified: testPassed,
      summary,
      testPassed,
      modifiedFiles,
      details: results,
    };
  } catch (error) {
    return {
      verified: false,
      summary: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
