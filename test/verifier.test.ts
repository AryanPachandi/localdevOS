import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import type { Workspace } from "../src/workspace/workspace.js";
import { runGoalVerification, selectVerificationStrategy, normalizeExecutionResult } from "../src/agent/verifier.js";
import type { TaskPlan, TaskState } from "../src/orchestrator/types.js";

const testWorkspace: Workspace = { root: process.cwd(), name: "localdevos" };

test("selectVerificationStrategy selects appropriate strategy per user goal and task type", () => {
  assert.equal(selectVerificationStrategy("show me files"), "FILESYSTEM");
  assert.equal(selectVerificationStrategy("show me the project tree"), "FILESYSTEM");
  assert.equal(selectVerificationStrategy("show me git status"), "GIT_STATUS");
  assert.equal(selectVerificationStrategy("show me git diff"), "GIT_STATUS");
  assert.equal(selectVerificationStrategy("push all changes to GitHub"), "GIT_PUSH");
  assert.equal(selectVerificationStrategy("create a file test.txt"), "CREATE_FILE");
  assert.equal(selectVerificationStrategy("create a Next.js project"), "CREATE_PROJECT");
  assert.equal(selectVerificationStrategy("run tests"), "TEST");
  assert.equal(selectVerificationStrategy("build the project"), "BUILD");
  assert.equal(selectVerificationStrategy("fix this TypeScript error"), "CODING");
  assert.equal(selectVerificationStrategy("hello"), "GENERIC_EXECUTION");
});

test("filesystem tasks pass on tool success without running npm test or build", async () => {
  const plan: TaskPlan = {
    id: "p1",
    goal: "show me files",
    workspacePath: testWorkspace.root,
    tasks: [
      {
        id: "work",
        type: "filesystem",
        description: "list_files",
        status: "completed",
        dependencies: [],
        attempts: 1,
        maxAttempts: 1,
        timeoutMs: 5000,
        workspace: testWorkspace.root,
        result: { ok: true, data: ["src", "package.json"] },
      },
    ],
  };

  const res = await runGoalVerification(testWorkspace, "show me files", false, undefined, plan);
  assert.equal(res.status, "passed");
  assert.equal(res.goalSatisfied, true);
  assert.ok(res.evidence.some((e) => e.includes("Filesystem inspection completed successfully")));
});

test("git status task passes when tool invocation completes cleanly", async () => {
  const plan: TaskPlan = {
    id: "p2",
    goal: "show me git status",
    workspacePath: testWorkspace.root,
    tasks: [
      {
        id: "work",
        type: "git",
        description: "git_status",
        status: "completed",
        dependencies: [],
        attempts: 1,
        maxAttempts: 1,
        timeoutMs: 5000,
        workspace: testWorkspace.root,
        result: { ok: true, data: "On branch main" },
      },
    ],
  };

  const res = await runGoalVerification(testWorkspace, "show me git status", false, undefined, plan);
  assert.equal(res.status, "passed");
  assert.equal(res.goalSatisfied, true);
});

test("create file task verifies presence of file on disk", async () => {
  const dummyFile = path.join(testWorkspace.root, "test_verifier_dummy.txt");
  fs.writeFileSync(dummyFile, "hello");

  try {
    const plan: TaskPlan = {
      id: "p3",
      goal: "create a file test_verifier_dummy.txt",
      workspacePath: testWorkspace.root,
      tasks: [
        {
          id: "work",
          type: "coding",
          description: "write_file",
          status: "completed",
          dependencies: [],
          attempts: 1,
          maxAttempts: 1,
          timeoutMs: 5000,
          workspace: testWorkspace.root,
          result: { ok: true, data: "File written" },
        },
      ],
    };

    const res = await runGoalVerification(testWorkspace, "create a file test_verifier_dummy.txt", false, undefined, plan);
    assert.equal(res.status, "passed");
    assert.equal(res.goalSatisfied, true);
  } finally {
    if (fs.existsSync(dummyFile)) fs.unlinkSync(dummyFile);
  }
});

test("general task completed execution falls back safely without failing", async () => {
  const plan: TaskPlan = {
    id: "p4",
    goal: "what is my current workspace?",
    workspacePath: testWorkspace.root,
    tasks: [
      {
        id: "work",
        type: "coding",
        description: "workspace query",
        status: "completed",
        dependencies: [],
        attempts: 1,
        maxAttempts: 1,
        timeoutMs: 5000,
        workspace: testWorkspace.root,
        result: { ok: true, data: "workspace info" },
      },
    ],
  };

  const res = await runGoalVerification(testWorkspace, "what is my current workspace?", false, undefined, plan);
  assert.notEqual(res.status, "failed");
  assert.ok(res.status === "passed" || res.status === "unverified");
});

test("actual tool error propagates to verification failure", async () => {
  const plan: TaskPlan = {
    id: "p5",
    goal: "run tests",
    workspacePath: testWorkspace.root,
    tasks: [
      {
        id: "work",
        type: "testing",
        description: "run_tests",
        status: "failed",
        error: { message: "Test suite exit code 1", kind: "code_failure" },
        dependencies: [],
        attempts: 1,
        maxAttempts: 1,
        timeoutMs: 5000,
        workspace: testWorkspace.root,
        result: { ok: false, error: { message: "Test suite exit code 1" } },
      },
    ],
  };

  const res = await runGoalVerification(testWorkspace, "run tests", false, undefined, plan);
  assert.equal(res.status, "failed");
  assert.equal(res.goalSatisfied, false);
});
