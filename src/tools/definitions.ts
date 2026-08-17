import type { Tool } from "ollama";

export const filesystemTools: Tool[] = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List immediate files and directories in a workspace directory. Use this to inspect a folder before reading files.",
      parameters: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Workspace-relative directory to list, such as '.' or 'src'.",
          },
        },
        required: ["directory"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file in the workspace and return its contents and metadata.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Workspace-relative path of the file to read.",
          },
        },
        required: ["filePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file in the workspace with UTF-8 text content.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Workspace-relative path of the file to write.",
          },
          content: {
            type: "string",
            description: "Text content to write to the file.",
          },
        },
        required: ["filePath", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Recursively find literal text in workspace files. Generated and dependency directories are skipped unless explicitly searched.",
      parameters: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Workspace-relative directory to search.",
          },
          query: {
            type: "string",
            description: "Literal text to find.",
          },
        },
        required: ["directory", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deploy_to_github",
      description: "Create a new GitHub repository for the current workspace, initialize Git if necessary, commit project files, configure origin, and push code to GitHub. This performs external side-effects and requires human approval.",
      parameters: {
        type: "object",
        properties: {
          repoName: {
            type: "string",
            description: "Name for the GitHub repository. Defaults to the workspace directory name.",
          },
          isPrivate: {
            type: "boolean",
            description: "Whether the repository should be private. Defaults to true for security.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "push_existing_repository",
      description: "Commit and push changes to an existing Git remote origin. Never creates a new GitHub repository. Requires human approval before pushing.",
      parameters: {
        type: "object",
        properties: {
          commitMessage: {
            type: "string",
            description: "Concise commit message summarizing changes.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_auth_status",
      description: "Check if the official GitHub CLI (gh) is authenticated on the host machine.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_create_repository",
      description: "Create a GitHub repository for the current workspace using GitHub CLI. Requires human approval.",
      parameters: {
        type: "object",
        properties: {
          repoName: {
            type: "string",
            description: "Name of the GitHub repository.",
          },
          isPrivate: {
            type: "boolean",
            description: "Whether the repository should be private.",
          },
        },
        required: ["repoName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_status",
      description: "Show working tree status for the current workspace.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_diff",
      description: "Show unstaged changes in the current workspace.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_log",
      description: "Show commit logs for the current workspace.",
      parameters: {
        type: "object",
        properties: {
          maxCount: {
            type: "number",
            description: "Number of commits to retrieve.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_init",
      description: "Initialize a Git repository in the current workspace directory.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_add",
      description: "Stage workspace files for Git commit.",
      parameters: {
        type: "object",
        properties: {
          pathSpec: {
            type: "string",
            description: "Path specification to stage, defaults to '.'.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_commit",
      description: "Create a Git commit with a concise message in the current workspace.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Commit message.",
          },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_push",
      description: "Push commits to the Git remote origin. Requires human approval.",
      parameters: {
        type: "object",
        properties: {
          remote: {
            type: "string",
            description: "Remote name, defaults to 'origin'.",
          },
          branch: {
            type: "string",
            description: "Branch name, defaults to current active branch.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_remote",
      description: "Get the configured Git remote origin URL for the current workspace.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "docker_ps",
      description: "List system-wide running docker containers.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "docker_compose_up",
      description: "Start docker compose services for the current workspace.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "docker_compose_build",
      description: "Build docker compose services for the current workspace.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_shell",
      description: "Execute a shell command inside the workspace directory.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute.",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_tests",
      description: "Run test suite (npm test) in the workspace directory.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_build",
      description: "Run build script (npm run build) in the workspace directory.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_lint",
      description: "Run linter (npm run lint) in the workspace directory.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];
