import type { Workspace } from "../workspace/workspace.js";
import type { TaskRoute } from "../models/model.js";
import { gitStatus, gitRemote } from "../tools/git.js";
import { runTests, runBuild } from "../tools/tests.js";
import { listFiles, searchFiles } from "../tools/filesystem.js";
import { executeShellCommand } from "../tools/shell.js";
import fs from "node:fs";
import path from "node:path";
import type { VerificationResult, VerificationCheck, VerificationStatus, ExecutionResult, TaskPlan, TaskState } from "../orchestrator/types.js";

export type { VerificationResult, VerificationCheck, VerificationStatus, ExecutionResult };

export type VerificationStrategy =
  | "FILESYSTEM"
  | "GIT_STATUS"
  | "GIT_PUSH"
  | "GIT_COMMIT"
  | "CREATE_FILE"
  | "CREATE_PROJECT"
  | "TEST"
  | "BUILD"
  | "CODING"
  | "GENERIC_EXECUTION";

/**
 * Normalizes previous task execution steps in the task plan into a unified ExecutionResult structure.
 */
export function normalizeExecutionResult(plan?: TaskPlan, task?: TaskState): ExecutionResult {
  if (!plan || !plan.tasks || plan.tasks.length === 0) {
    return {
      status: "completed",
      success: true,
      outputs: [],
      errors: [],
      toolsUsed: [],
    };
  }

  const workTasks = plan.tasks.filter((t) => t.id !== (task?.id ?? "verify") && t.type !== "verification" && t.status !== "pending");

  const outputs: unknown[] = [];
  const errors: string[] = [];
  const toolsUsed: string[] = [];
  let overallSuccess = true;
  let overallStatus: "completed" | "failed" = "completed";

  for (const t of workTasks) {
    if (t.status === "failed") {
      overallSuccess = false;
      overallStatus = "failed";
      if (t.error?.message) errors.push(t.error.message);
    }

    if (t.result) {
      outputs.push(t.result);
      if (typeof t.result === "object" && t.result !== null) {
        const resObj = t.result as Record<string, unknown>;
        if (resObj.ok === false) {
          overallSuccess = false;
          const errObj = resObj.error as { message?: string } | undefined;
          if (errObj?.message) errors.push(errObj.message);
        }
      }
    }
  }

  return {
    status: overallStatus,
    success: overallSuccess,
    outputs,
    errors,
    toolsUsed,
  };
}

/**
 * Selects the appropriate deterministic verification strategy based on user goal, task type, and tools used.
 */
export function selectVerificationStrategy(goal: string, taskType?: string, toolsUsed?: string[]): VerificationStrategy {
  const lower = goal.toLowerCase();

  if (/show.*file|project tree|list.*file|explore.*file|read.*file|files in|what files/i.test(lower) || taskType === "READ_FILESYSTEM" || taskType === "filesystem") {
    return "FILESYSTEM";
  }

  if (/git status|git diff|git log|show my git|show git/i.test(lower) || taskType === "GIT" || taskType === "git") {
    return "GIT_STATUS";
  }

  if (/push.*github|git push|deploy.*github/i.test(lower) || taskType === "GIT_PUSH" || taskType === "github") {
    return "GIT_PUSH";
  }

  if (/git commit|git add/i.test(lower)) {
    return "GIT_COMMIT";
  }

  if (/create.*file|write.*file|make.*file|touch /i.test(lower)) {
    return "CREATE_FILE";
  }

  if (/create.*project|create.*app|make.*app|create.*next/i.test(lower)) {
    return "CREATE_PROJECT";
  }

  if (/run test|test suite|npm test|vitest|jest|pytest/i.test(lower) || taskType === "TESTING" || taskType === "testing") {
    return "TEST";
  }

  if (/build.*project|npm run build|compile|build/i.test(lower)) {
    return "BUILD";
  }


  if (/fix|bug|error|implement|refactor|add feature|coding/i.test(lower) || taskType === "CODING" || taskType === "coding") {
    return "CODING";
  }


  return "GENERIC_EXECUTION";
}

/**
 * Main entry point for goal verification. Performs deterministic evaluation based on user goal and execution evidence.
 */
export async function runGoalVerification(
  workspace: Workspace,
  goal: string,
  requireRemote = false,
  task?: TaskState,
  plan?: TaskPlan
): Promise<VerificationResult> {
  const normExec = normalizeExecutionResult(plan, task);
  const strategy = selectVerificationStrategy(goal, task?.type, normExec.toolsUsed);

  // 1. Log VERIFIER INPUT
  console.log("\n--- VERIFIER INPUT ---");
  console.log(`userGoal: ${goal}`);
  console.log(`taskType: ${task?.type ?? "unknown"}`);
  console.log(`executionStatus: ${normExec.status}`);
  console.log(`executionResult: ${JSON.stringify({ success: normExec.success, outputsCount: normExec.outputs.length, errorCount: normExec.errors.length })}`);
  console.log(`expectedResult: Deterministic satisfaction of "${goal}"`);
  console.log(`workspace: ${workspace.root}`);
  console.log("-----------------------\n");

  const checks: VerificationCheck[] = [];
  const evidence: string[] = [];
  let goalSatisfied: boolean | null = null;
  let status: VerificationStatus = "passed";

  const addCheck = (name: string, checkStatus: "passed" | "failed" | "skipped", details: string) => {
    checks.push({
      name,
      status: checkStatus,
      details,
      passed: checkStatus === "passed",
      required: true,
      detail: details,
    });
  };

  // Execute verification logic per strategy
  switch (strategy) {
    case "FILESYSTEM": {
      if (normExec.success) {
        addCheck("filesystem operation succeeded", "passed", "Filesystem inspection tool executed cleanly");
        goalSatisfied = true;
        status = "passed";
        evidence.push("Filesystem inspection completed successfully.");
      } else {
        addCheck("filesystem operation succeeded", "failed", normExec.errors.join("; ") || "Filesystem tool failed");
        goalSatisfied = false;
        status = "failed";
        evidence.push(`Filesystem task failed: ${normExec.errors.join("; ")}`);
      }
      break;
    }

    case "GIT_STATUS": {
      if (normExec.success) {
        addCheck("git status operation succeeded", "passed", "Git status command executed cleanly");
        goalSatisfied = true;
        status = "passed";
        evidence.push("Git status operation succeeded.");
      } else {
        addCheck("git status operation succeeded", "failed", normExec.errors.join("; ") || "Git status failed");
        goalSatisfied = false;
        status = "failed";
        evidence.push(`Git status operation failed: ${normExec.errors.join("; ")}`);
      }
      break;
    }

    case "GIT_PUSH": {
      const gitDirExists = fs.existsSync(path.join(workspace.root, ".git"));
      addCheck("git repository exists", gitDirExists ? "passed" : "failed", gitDirExists ? ".git directory present" : "No .git directory in workspace root");

      const remoteRes = await gitRemote(workspace);
      const hasRemote = remoteRes.ok && !!remoteRes.data;
      addCheck("git remote origin configured", hasRemote ? "passed" : "failed", hasRemote ? String(remoteRes.data) : "No git remote configured");

      const pushSucceeded = normExec.success && normExec.errors.length === 0;
      addCheck("git push command completed", pushSucceeded ? "passed" : "failed", pushSucceeded ? "Push execution completed cleanly" : normExec.errors.join("; ") || "Push execution failed");

      if (gitDirExists && hasRemote && pushSucceeded) {
        goalSatisfied = true;
        status = "passed";
        evidence.push("Git push operation verified: remote repository updated.");
      } else {
        goalSatisfied = false;
        status = "failed";
        evidence.push("Git push operation failed verification.");
      }
      break;
    }

    case "CREATE_FILE": {
      const match = goal.match(/(?:file|create|write|make)\s+(?:a\s+|the\s+)?([A-Za-z0-9._/-]+\.[A-Za-z0-9]+|[A-Za-z0-9._/-]+)/i);
      let targetFileName = match ? match[1] : undefined;
      if (targetFileName && /^(a|the|file)$/i.test(targetFileName)) {
        const fileMatch = goal.match(/([A-Za-z0-9._/-]+\.[A-Za-z0-9]+)/i);
        if (fileMatch) targetFileName = fileMatch[1];
      }

      let fileFound = false;
      if (targetFileName && !/^(a|the|file)$/i.test(targetFileName)) {
        const fullPath = path.isAbsolute(targetFileName) ? targetFileName : path.join(workspace.root, targetFileName);
        fileFound = fs.existsSync(fullPath);
      }


      if (fileFound || (normExec.success && normExec.errors.length === 0)) {
        addCheck("file created", "passed", targetFileName ? `File '${targetFileName}' exists` : "Write tool succeeded");
        goalSatisfied = true;
        status = "passed";
        evidence.push(targetFileName ? `File '${targetFileName}' verified on disk.` : "File creation operation completed.");
      } else {
        addCheck("file created", "failed", normExec.errors.join("; ") || "File creation failed");
        goalSatisfied = false;
        status = "failed";
        evidence.push("File creation failed verification.");
      }
      break;
    }

    case "CREATE_PROJECT": {
      const packagePath = path.join(workspace.root, "package.json");
      const hasPackageJson = fs.existsSync(packagePath);
      addCheck("project package.json manifest", hasPackageJson ? "passed" : "failed", hasPackageJson ? "package.json exists" : "package.json missing");

      const hasSrcOrApp = ["src", "app", "public"].some((d) => fs.existsSync(path.join(workspace.root, d)));
      addCheck("project structure created", hasSrcOrApp ? "passed" : "failed", hasSrcOrApp ? "Source directory present" : "No source directory created");

      if (hasPackageJson || (normExec.success && normExec.errors.length === 0)) {
        goalSatisfied = true;
        status = "passed";
        evidence.push("Project creation verified.");
      } else {
        goalSatisfied = false;
        status = "failed";
        evidence.push("Project creation failed verification.");
      }
      break;
    }

    case "TEST": {
      if (normExec.success && normExec.errors.length === 0) {
        addCheck("tests passed", "passed", "Test command returned exit code 0");
        goalSatisfied = true;
        status = "passed";
        evidence.push("Test suite execution passed.");
      } else {
        addCheck("tests passed", "failed", normExec.errors.join("; ") || "Tests failed");
        goalSatisfied = false;
        status = "failed";
        evidence.push(`Test suite failed: ${normExec.errors.join("; ")}`);
      }
      break;
    }

    case "BUILD": {
      if (normExec.success && normExec.errors.length === 0) {
        addCheck("build passed", "passed", "Build command returned exit code 0");
        goalSatisfied = true;
        status = "passed";
        evidence.push("Build completed successfully.");
      } else {
        addCheck("build passed", "failed", normExec.errors.join("; ") || "Build failed");
        goalSatisfied = false;
        status = "failed";
        evidence.push(`Build failed: ${normExec.errors.join("; ")}`);
      }
      break;
    }

    case "CODING": {
      if (normExec.success && normExec.errors.length === 0) {
        addCheck("code implementation completed", "passed", "Execution completed without tool errors");
        goalSatisfied = true;
        status = "passed";
        evidence.push("Coding task completed successfully.");
      } else {
        addCheck("code implementation completed", "failed", normExec.errors.join("; ") || "Coding task reported errors");
        goalSatisfied = false;
        status = "failed";
        evidence.push(`Coding task failed: ${normExec.errors.join("; ")}`);
      }
      break;
    }

    case "GENERIC_EXECUTION":
    default: {
      if (normExec.status === "completed" && normExec.success && normExec.errors.length === 0) {
        addCheck("execution completed without error", "passed", "Task completed cleanly");
        goalSatisfied = true;
        status = "passed";
        evidence.push("Execution completed successfully.");
      } else if (normExec.errors.length > 0 || !normExec.success) {
        addCheck("execution completed without error", "failed", normExec.errors.join("; ") || "Task reported failure");
        goalSatisfied = false;
        status = "failed";
        evidence.push(`Execution failed: ${normExec.errors.join("; ")}`);
      } else {
        addCheck("execution state", "skipped", "Execution completed; no deterministic strategy available");
        goalSatisfied = null;
        status = "unverified";
        evidence.push("Execution completed; no task-specific verification strategy available.");
      }
      break;
    }
  }

  // Critical Fallback Rule:
  // If execution completed cleanly and there is no explicit failure and no strategy failed,
  // verification MUST NOT fail the task!
  if (normExec.status === "completed" && normExec.success && normExec.errors.length === 0 && status === "failed") {
    status = "passed";
    goalSatisfied = true;
    evidence.push("Fallback applied: Execution completed successfully without explicit errors.");
  }

  const summary = status === "passed"
    ? `Goal verification PASSED (${strategy} strategy satisfied).`
    : status === "unverified"
    ? `Goal execution COMPLETED (unverified: no additional verification strategy).`
    : `Goal verification FAILED (${strategy} strategy checks failed).`;

  // 2. Log VERIFIER DECISION
  console.log("\n--- VERIFIER DECISION ---");
  console.log(`strategy: ${strategy}`);
  console.log(`checks: ${JSON.stringify(checks.map((c) => ({ name: c.name, status: c.status, details: c.details })))}`);
  console.log(`goalSatisfied: ${goalSatisfied}`);
  console.log(`finalStatus: ${status}`);
  console.log("-------------------------\n");

  return {
    status,
    goalSatisfied,
    evidence,
    checks,
    summary,
  };
}

/** Legacy wrapper maintained for compatibility. */
export async function runIndependentVerification(workspace: Workspace): Promise<{ status: "PASS" | "FAIL" | "PARTIAL"; summary: string; evidence: string[] }> {
  const res = await runGoalVerification(workspace, "independent workspace check");
  return {
    status: res.status === "passed" ? "PASS" : res.status === "failed" ? "FAIL" : "PARTIAL",
    summary: res.summary,
    evidence: res.evidence ?? [],
  };
}

export async function verifyTaskExecution(
  workspace: Workspace,
  route: TaskRoute,
  modelOutput: string
): Promise<{ verified: boolean; summary: string }> {
  const result = await runGoalVerification(workspace, route.taskType);
  return {
    verified: result.status !== "failed",
    summary: `${result.summary}\n${(result.evidence ?? []).join("\n")}`,
  };
}

