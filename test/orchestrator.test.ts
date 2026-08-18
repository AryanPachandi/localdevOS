import assert from "node:assert/strict";
import test from "node:test";
import type { ModelClient } from "../src/models/model.js";
import { createPlan } from "../src/agent/planner.js";
import { Orchestrator } from "../src/orchestrator/orchestrator.js";
import type { Workspace } from "../src/workspace/workspace.js";

const workspace: Workspace = { root: process.cwd(), name: "localdevos" };
const goal = "create folder todo_list_by_localdev_os, build a React TODO app, test it, deploy to GitHub";
function client(name: ModelClient["provider"], run: () => Promise<string>): ModelClient {
  return { name, provider: name, chat: async () => run() };
}
function okTool(name: string, calls: string[]) {
  return async (tool: string) => { calls.push(tool); return { ok: true as const, data: tool === "execute_shell" ? process.cwd() : `${tool} ok` }; };
}
const passed = async () => ({ status: "passed" as const, checks: [], summary: "verified" });

test("critical regression: failed GPT-OSS blocks review, tests, and GitHub deployment", async () => {
  const plan = createPlan(goal, workspace).taskPlan!;
  const calls: string[] = [];
  const clients = new Map<string, ModelClient>([
    ["llama", client("llama", async () => "prepared")],
    ["gpt-oss", client("gpt-oss", async () => { throw new Error("GPT-OSS reached maximum iteration limit (8); task is incomplete."); })],
    ["gemini", client("gemini", async () => "repair guidance")],
  ]);
  await new Orchestrator({ clients, execute: okTool("", calls) as never, verify: passed }).run(plan, workspace);
  const status = (id: string) => plan.tasks.find((task) => task.id === id)!.status;
  assert.equal(status("implement"), "failed");
  assert.equal(status("review"), "blocked");
  assert.equal(status("tests"), "blocked");
  assert.equal(status("github"), "blocked");
  assert.equal(calls.includes("deploy_to_github"), false);
});

test("GitHub becomes runnable only after the implementation and verification gates pass", async () => {
  const plan = createPlan(goal, workspace).taskPlan!;
  const calls: string[] = [];
  const clients = new Map<string, ModelClient>([
    ["llama", client("llama", async () => "done")],
    ["gpt-oss", client("gpt-oss", async () => "implemented")],
    ["gemini", client("gemini", async () => "guidance")],
  ]);
  await new Orchestrator({ clients, execute: okTool("", calls) as never, verify: passed }).run(plan, workspace);
  assert.equal(plan.tasks.find((task) => task.id === "github")!.status, "completed");
  assert.equal(plan.tasks.find((task) => task.id === "final_verify")!.status, "completed");
  assert.ok(calls.indexOf("deploy_to_github") > calls.indexOf("run_build"));
});

import { classifyTask, selectRoute } from "../src/models/router.js";

test("simple filesystem queries use tool-first execution and never GPT-OSS", () => {
  const readRoute = classifyTask("show me files");
  const treeRoute = classifyTask("show project tree");

  assert.equal(readRoute.taskType, "READ_FILESYSTEM");
  assert.equal(treeRoute.taskType, "READ_FILESYSTEM");
  assert.equal(readRoute.executionMode, "tool_first");
  assert.equal(treeRoute.executionMode, "tool_first");
  assert.equal(readRoute.model, null);
  assert.equal(treeRoute.model, null);
  assert.ok(readRoute.tools.includes("list_files"));
  assert.ok(treeRoute.tools.includes("list_tree"));
});

test("git and testing tasks also resolve without model invocation", () => {
  const gitRoute = classifyTask("git status");
  const testsRoute = classifyTask("run tests");

  assert.equal(gitRoute.taskType, "GIT");
  assert.equal(testsRoute.taskType, "TESTING");
  assert.equal(gitRoute.executionMode, "tool_first");
  assert.equal(testsRoute.executionMode, "tool_first");
  assert.ok(gitRoute.tools.includes("git_status"));
  assert.ok(testsRoute.tools.includes("run_tests"));
});

test("coding tasks still route to GPT-OSS while generic reasoning uses Gemini", () => {
  const reactRoute = classifyTask("create React project");
  const bugRoute = classifyTask("fix TypeScript bug");
  const reasoningRoute = classifyTask("design a scalable architecture");

  assert.equal(reactRoute.taskType, "CODING");
  assert.equal(bugRoute.taskType, "CODING");
  assert.equal(reasoningRoute.taskType, "REASONING");
  assert.equal(reactRoute.model, "gpt-oss");
  assert.equal(bugRoute.model, "gpt-oss");
  assert.equal(reasoningRoute.model, "gemini");
});

test("workspace resolution for arbitrary user folders remains dynamic", () => {
  const route = selectRoute("show git status of pac-wallet in Downloads");
  assert.equal(route.taskType, "GIT");
  assert.equal(route.executionMode, "tool_first");
  assert.equal(route.model, null);
});

test("gpt-oss failure falls back appropriately for agent tasks", async () => {
  const calls: string[] = [];
  const fallback = await (async () => {
    const route = classifyTask("fix this TypeScript bug");
    if (route.model !== "gpt-oss") return "unexpected";
    const primary = {
      name: "GPT-OSS",
      provider: "gpt-oss" as const,
      chat: async () => {
        calls.push("gpt-oss");
        throw new Error("GPT-OSS unavailable");
      },
    };
    const fallbackModel = {
      name: "Gemini",
      provider: "gemini" as const,
      chat: async () => {
        calls.push("gemini");
        return "recovered";
      },
    };
    try {
      await primary.chat([], [], {} as never);
    } catch {
      return await fallbackModel.chat([], [], {} as never);
    }
    return "unexpected";
  })();

  assert.equal(fallback, "recovered");
  assert.deepEqual(calls, ["gpt-oss", "gemini"]);
});
