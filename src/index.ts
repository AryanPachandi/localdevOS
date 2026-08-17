import { runAgent } from "./agent/agent.js";
import { createInterface } from "node:readline/promises";
import { speechToText } from "./speech/speechToText.js";
import { createWorkspace, type Workspace } from "./workspace/workspace.js";
import "dotenv/config";

function parseCliArgs(args: string[]): { projectPath?: string; prompt?: string } {
  let projectPath: string | undefined;
  const promptTokens: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--project" || arg === "-p") {
      const nextArg = args[i + 1];
      if (nextArg !== undefined) {
        projectPath = nextArg;
        i++;
      }
    } else if (arg.startsWith("--project=")) {
      projectPath = arg.slice("--project=".length);
    } else if (arg.startsWith("-p=")) {
      projectPath = arg.slice("-p=".length);
    } else {
      promptTokens.push(arg);
    }
  }

  const promptStr = promptTokens.join(" ").trim();
  const result: { projectPath?: string; prompt?: string } = {};
  if (projectPath !== undefined) {
    result.projectPath = projectPath;
  }
  if (promptStr) {
    result.prompt = promptStr;
  }
  return result;
}

function printMenu(workspace: Workspace): void {
  console.log(`
╭──────────────────────────────╮
│          LocalDevOS          │
│     Local AI Developer       │
╰──────────────────────────────╯

📂 Workspace:
   ${workspace.root}

Choose input:

[t] Type
[v] Voice
[q] Quit`);
}

async function promptUser(question: string): Promise<string> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await readline.question(question)).trim();
  } finally {
    readline.close();
  }
}

async function handlePrompt(prompt: string, workspace: Workspace): Promise<void> {
  if (!prompt.trim()) {
    console.log("⚠️ I couldn't understand that. Please try again.");
    return;
  }
  console.log(`\nYou: ${prompt}`);
  console.log(`\n${await runAgent(prompt, workspace)}`);
}

async function startInteractiveCli(workspace: Workspace): Promise<void> {
  while (true) {
    printMenu(workspace);
    const choice = (await promptUser("\n> ")).toLowerCase();
    if (choice === "q") return;
    if (choice === "t") {
      await handlePrompt(await promptUser("You: "), workspace);
    } else if (choice === "v") {
      try {
        await handlePrompt(await speechToText(), workspace);
      } catch (error) {
        console.log(`⚠️ ${error instanceof Error ? error.message : "Speech-to-text failed. Please try again."}`);
      }
    } else {
      console.log("⚠️ Choose t, v, or q.");
    }
  }
}

async function main(): Promise<void> {
  const { projectPath, prompt } = parseCliArgs(process.argv.slice(2));

  let workspace: Workspace;
  try {
    workspace = createWorkspace(projectPath);
  } catch (error) {
    console.error(`⚠️ ${(error as Error).message}`);
    process.exit(1);
  }

  if (prompt) {
    await handlePrompt(prompt, workspace);
  } else {
    await startInteractiveCli(workspace);
  }
}

await main();
