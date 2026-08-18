# LocalDevOS

**LocalDevOS** is a local AI‑driven developer assistant built on top of the Llama 3.2 model (via Ollama). It provides a programmable agent framework that can:

- Interact with the filesystem, Git, Docker and other development tools via well‑defined tool calls.
- Maintain project memory and state, allowing it to reason over code, tests, builds and runtime diagnostics.
- Verify its own actions by running tests, linting, building, and requiring human approval for risky operations.
- Operate through a simple CLI (`devai "<prompt>"`) and later through an Electron + React UI.

The goal is to create a **self‑contained, on‑device, autonomous development OS** that never sends your source code to the cloud.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Running the Agent](#running-the-agent)
- [Available Commands](#available-commands)
- [Project Structure](#project-structure)
- [Development](#development)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **LLM Backend** – Uses Ollama’s local API (`localhost:11434`) with the Llama 3.2 model.
- **Tool Suite** – Filesystem, Git, Docker, shell execution, test runner, build scripts, etc.
- **Verification Loop** – Runs `npm test`, lint, build, and type‑check before accepting changes.
- **Human Approval** – Potentially destructive actions (e.g., `git push`, `docker rm`) require explicit user consent.
- **Permission System** – Fine‑grained allow/ask/deny policy for each tool.
- **Project Memory** – Persists knowledge about the current project (frameworks, scripts, known issues) in a local SQLite DB.
- **CLI First** – Simple command‑line interface; UI can be added later.

---

## Installation

1. **Prerequisites**
   - Node.js ≥ 20
   - Ollama installed and the `llama3.2` model pulled (`ollama pull llama3.2`).
   - Docker (optional – required for Docker tools).

2. **Clone the repository**
   ```bash
   git clone https://github.com/AryanPachandi/localdevOS.git
   cd localdevOS
   ```

3. **Install dependencies**
   ```bash
   npm ci
   ```

4. **Build the Electron renderer (optional for UI)**
   ```bash
   npm run build:renderer
   ```

5. **Compile the TypeScript source**
   ```bash
   npm run build:electron
   ```

---

## Running the Agent

The core entry point is `src/index.ts`. You can run the CLI directly with `tsx`:

```bash
# Basic usage – ask the agent a question or give a command
npx tsx src/index.ts "list files in this project"
```

Or use the provided npm script:

```bash
npm run dev "<prompt>"
```

Examples:

```bash
# Show the current Git status
npm run dev "what is the git status?"

# Run the test suite and let the agent explain failures
npm run dev "run my tests and explain any failures"

# Debug a Docker container
npm run dev "why is my backend container restarting?"
```

---

## Available Commands (Tool Calls)

| Category | Tools |
|----------|-------|
| **Filesystem** | `list_directory`, `read_file`, `search_files`, `create_file`, `modify_file`, `delete_file` |
| **Git** | `git_status`, `git_diff`, `git_log`, `git_branch`, `git_checkout`, `git_add`, `git_commit` |
| **Docker** | `docker_ps`, `docker_logs`, `docker_inspect`, `docker_images`, `docker_stats`, `docker_restart`, `docker_build`, `docker_exec` |
| **Development** | `run_tests`, `run_lint`, `run_typecheck`, `run_build` |
| **Shell** | `execute_shell` |

All tools are defined in `src/tools/*.ts` and exposed to the Llama model via a JSON‑RPC‑like schema.

---

## Project Structure

```
localdevos/
├─ src/                     # Core source code
│  ├─ agent/                # Agent loop (planner, executor, verifier)
│  ├─ models/               # LLM wrappers (Gemini, GPT‑OSS, Ollama router)
│  ├─ orchestrator/         # State machine and task graph
│  ├─ renderer/             # Electron + React UI (optional)
│  ├─ tools/                # Implementations of filesystem, git, docker, etc.
│  ├─ memory/               # SQLite memory layer
│  └─ index.ts               # Entry point
├─ test/                    # Jest‑style unit tests
├─ overview.md              # Design overview (the original spec)
├─ package.json
└─ README.md                # ← This file
```

---

## Development

- **Watch mode** (re‑compile on changes):
  ```bash
  npm run dev:electron
  ```
- **Run the renderer only**:
  ```bash
  npm run build:renderer && npx serve ./dist/renderer
  ```
- **Add new tools** – create a file in `src/tools/`, export a function adhering to the `ToolDefinition` interface, and register it in `src/agent/planner.ts`.

---

## Testing

The test suite lives under `test/` and uses `tsx` as the test runner.

```bash
npm test
```

The verifier component automatically runs the test suite after any code modification and reports success/failure before committing changes.

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feat/your-feature`).
3. Write tests for new functionality.
4. Ensure all existing tests pass (`npm test`).
5. Submit a pull request.

---

## License

This project is licensed under the **ISC** license – see the `LICENSE` file for details.

---

*Built with ❤️ by the LocalDevOS community.*
