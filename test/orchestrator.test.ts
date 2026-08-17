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
