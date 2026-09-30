import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = resolve("scripts/ignore-app-deploy.sh");
let repo: string;
function git(...args: string[]) {
  return execFileSync("git", args, { cwd: repo, stdio: "pipe" });
}
function commit(file: string, content: string) {
  writeFileSync(resolve(repo, file), content);
  git("add", ".");
  git("commit", "-m", "fixture");
}
function ignoreStatus() {
  return spawnSync("bash", [script], { cwd: repo }).status;
}

beforeEach(() => {
  repo = mkdtempSync(resolve(tmpdir(), "sqft-deploy-check-"));
  git("init", "-b", "main");
  git("config", "user.name", "SqFt test");
  git("config", "user.email", "test@example.test");
  mkdirSync(resolve(repo, "www"));
  commit("app.ts", "original");
  commit("www/index.html", "original");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("app deployment change detection", () => {
  it("builds app changes and skips marketing-only changes", () => {
    commit("app.ts", "updated");
    expect(ignoreStatus()).toBe(1);
    commit("www/index.html", "updated");
    expect(ignoreStatus()).toBe(0);
  });

  it.each([
    true,
    false,
  ])("checks both parents when merging main produces no first-parent changes (app=%s)", (appChanged) => {
    git("checkout", "-b", "feature");
    commit(appChanged ? "app.ts" : "www/index.html", "updated");
    git("checkout", "main");
    git("commit", "--allow-empty", "-m", "main advanced");
    git("checkout", "feature");
    git("merge", "--no-ff", "--no-edit", "main");
    expect(git("diff", "HEAD^", "HEAD").toString()).toBe("");
    expect(ignoreStatus()).toBe(appChanged ? 1 : 0);
  });
});
