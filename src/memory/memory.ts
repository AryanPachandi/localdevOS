import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface MemoryEntry {
  id: string;
  type: "project" | "decision" | "task" | "error" | "preference";
  content: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, string> | undefined;
}

interface MemoryStore {
  workspace: string;
  entries: MemoryEntry[];
}

export class Memory {
  private readonly filePath: string;
  private store: MemoryStore;

  constructor(workspaceRoot: string) {
    this.filePath = path.join(
      workspaceRoot,
      ".localdevos",
      "memory.json"
    );

    this.store = {
      workspace: workspaceRoot,
      entries: [],
    };
  }

  /**
   * Load memory from disk.
   * If no memory exists, start with an empty store.
   */
  async load(): Promise<void> {
    try {
      const data = await readFile(this.filePath, "utf8");
      this.store = JSON.parse(data) as MemoryStore;
    } catch {
      this.store = {
        workspace: path.dirname(this.filePath),
        entries: [],
      };
    }
  }

  /**
   * Save memory to disk.
   */
  async save(): Promise<void> {
    await mkdir(path.dirname(this.filePath), {
      recursive: true,
    });

    await writeFile(
      this.filePath,
      JSON.stringify(this.store, null, 2),
      "utf8"
    );
  }

  /**
   * Add a new memory.
   */
  async add(
    type: MemoryEntry["type"],
    content: string,
    metadata?: Record<string, string>
  ): Promise<MemoryEntry> {
    const now = new Date().toISOString();

    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      type,
      content,
      createdAt: now,
      updatedAt: now,
      metadata,
    };

    this.store.entries.push(entry);

    await this.save();

    return entry;
  }

  /**
   * Get all memories.
   */
  getAll(): MemoryEntry[] {
    return [...this.store.entries];
  }

  /**
   * Get memories of a specific type.
   */
  getByType(type: MemoryEntry["type"]): MemoryEntry[] {
    return this.store.entries.filter(
      (entry) => entry.type === type
    );
  }

  /**
   * Search memory using simple text matching.
   *
   * This is intentionally simple for now.
   * Later this can be replaced by semantic/vector search.
   */
  search(query: string): MemoryEntry[] {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return this.store.entries
      .map((entry) => {
        const text = entry.content.toLowerCase();

        const score = words.reduce(
          (total, word) =>
            text.includes(word) ? total + 1 : total,
          0
        );

        return {
          entry,
          score,
        };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((result) => result.entry);
  }

  /**
   * Remove a memory.
   */
  async remove(id: string): Promise<boolean> {
    const originalLength = this.store.entries.length;

    this.store.entries = this.store.entries.filter(
      (entry) => entry.id !== id
    );

    if (this.store.entries.length === originalLength) {
      return false;
    }

    await this.save();

    return true;
  }

  /**
   * Clear all memories.
   */
  async clear(): Promise<void> {
    this.store.entries = [];
    await this.save();
  }
}
