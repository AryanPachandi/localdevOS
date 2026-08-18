import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WorkspaceManager, assertWithinUserRoot, parseProjectCreationIntent, resolveKnownLocation } from "../src/workspace/workspaceManager.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "localdevos-scope-"));
  const app = path.join(root, "localdevos"); const downloads = path.join(root, "Downloads"); const documents = path.join(root, "Documents");
  fs.mkdirSync(app); fs.mkdirSync(downloads); fs.mkdirSync(documents);
  const project = path.join(downloads, "pacwallet"); fs.mkdirSync(project); fs.writeFileSync(path.join(project, "package.json"), "{}");
  return { root, app, downloads, documents, project, manager: new WorkspaceManager({ userRoot: root, applicationRoot: app }) };
}

test("startup separates application root, user scope, and active workspace", () => {
  const { root, app, manager } = fixture(); const scope = manager.getScope();
  assert.equal(scope.userRoot, fs.realpathSync(root)); assert.equal(scope.applicationRoot, app); assert.equal(scope.activeWorkspace, null);
});

test("resolves a Downloads project from natural language and auto-switches", () => {
  const { project, manager } = fixture();
  const result = manager.resolve("what is the git status of pacwallet folder in downloads folder");
  assert.equal(result.kind, "resolved"); assert.equal(result.workspace?.root, project); assert.equal(manager.getScope().activeWorkspace, project); assert.equal(manager.getScope().source, "automatic");
});

test("supports absolute and tilde paths, creation in Documents, and rejects traversal", () => {
  const { root, documents, project, manager } = fixture();
  assert.equal(manager.resolve(`show files in ${project}`).workspace?.root, project);
  assert.equal(manager.resolve("show files in ~/Downloads/pacwallet").workspace?.root, project);
  const created = manager.resolve("create a project named next_todo in Documents");
  assert.equal(created.kind, "resolved"); assert.equal(created.workspace?.root, path.join(documents, "next_todo"));
  assert.throws(() => assertWithinUserRoot(path.join(root, "Downloads", "..", "..", "etc"), root));
  assert.throws(() => assertWithinUserRoot("/etc", root));
});

test("does not guess among multiple matching projects", () => {
  const { root, manager } = fixture(); const documentsProject = path.join(root, "Documents", "pacwallet");
  fs.mkdirSync(documentsProject); fs.writeFileSync(path.join(documentsProject, "package.json"), "{}");
  const result = manager.resolve("show git status of pacwallet");
  assert.equal(result.kind, "ambiguous"); assert.equal(result.candidates?.length, 2);
});

test("rejects a symlink that escapes the configured user root", () => {
  const { root } = fixture(); const link = path.join(root, "outside");
  fs.symlinkSync("/etc", link); assert.throws(() => assertWithinUserRoot(link, root));
});

test("creation intent treats 'by' as filler and constructs only a controlled Documents path", () => {
  const { root, documents, manager } = fixture();
  const prompt = "create a project in documents folder named by test_localdev_os initate nextjs project in it and deploy to github";
  assert.deepEqual(parseProjectCreationIntent(prompt), { action: "create_project", location: "documents", projectName: "test_localdev_os", framework: "nextjs", deployToGithub: true });
  const result = manager.resolve(prompt);
  assert.equal(result.kind, "resolved");
  assert.equal(result.workspace?.root, path.join(documents, "test_localdev_os"));
  assert.equal(fs.existsSync(path.join(documents, "test_localdev_os")), true);
  assert.equal(resolveKnownLocation("Documents", root), documents);
});

test("common Documents typo still uses the controlled Documents location", () => {
  const { documents, manager } = fixture();
  const result = manager.resolve("create a project in documets folder named by test_localdev_os initate nextjs project in it and deploy to github");
  assert.equal(result.kind, "resolved");
  assert.equal(result.workspace?.root, path.join(documents, "test_localdev_os"));
});

test("creation names and locations are deterministic and reject traversal-like names", () => {
  const { root, downloads, documents, manager } = fixture();
  assert.equal(manager.resolve("create a Next.js project called next_todo in Documents").workspace?.root, path.join(documents, "next_todo"));
  assert.equal(manager.resolve("create test_app in Downloads").workspace?.root, path.join(downloads, "test_app"));
  assert.equal(manager.resolve("create ../../etc in Documents").kind, "none");
  assert.equal(manager.resolve("create /etc/hack").kind, "none");
  assert.throws(() => parseProjectCreationIntent("create a project named ../../etc in Documents"));
  assert.equal(resolveKnownLocation("home", root), root);
});
