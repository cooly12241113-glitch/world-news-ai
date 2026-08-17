import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const file = (relativePath: string): string =>
  fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url));
const read = (relativePath: string): string =>
  readFileSync(file(relativePath), "utf8");
const environmentWithoutLiveUrl = (value?: string): NodeJS.ProcessEnv => {
  const environment = { ...process.env };
  if (value === undefined) delete environment.LIVE_WEB_URL;
  else environment.LIVE_WEB_URL = value;
  return environment;
};

describe("live Web acceptance isolation", () => {
  it("structurally excludes acceptance files from default Vitest discovery", () => {
    const defaultConfig = read("vitest.config.ts");
    const acceptancePath =
      "src/source-acquisition-security/__acceptance__/live-web-manual.acceptance.ts";

    expect(defaultConfig).toContain('"**/*.acceptance.ts"');
    expect(defaultConfig).not.toContain("disableConsoleIntercept");
    expect(acceptancePath).not.toMatch(/\.test\.[cm]?[jt]sx?$/u);
  });

  it("does not discover live acceptance when ambient LIVE_WEB_URL is populated", () => {
    const listed = spawnSync(
      process.execPath,
      [
        file("node_modules/vitest/vitest.mjs"),
        "list",
        "live-web-manual.acceptance.ts",
        "--config",
        file("vitest.config.ts"),
      ],
      {
        cwd: repositoryRoot,
        env: environmentWithoutLiveUrl("https://network-must-not-run.invalid/article"),
        encoding: "utf8",
      },
    );

    expect(listed.status).toBe(0);
    expect(listed.stdout).not.toContain("live-web-manual.acceptance.ts");
    expect(listed.stderr).not.toContain("LIVE_WEB_URL_REQUIRED");
  });

  it.each([
    ["absent", undefined],
    ["whitespace", "  \t  "],
  ] as const)("fails the dedicated command when LIVE_WEB_URL is %s", (_label, value) => {
    const execution = spawnSync(
      process.execPath,
      [file("scripts/run-live-web-acceptance.mjs")],
      {
        cwd: repositoryRoot,
        env: environmentWithoutLiveUrl(value),
        encoding: "utf8",
      },
    );

    expect(execution.status).toBe(2);
    expect(execution.stdout).toBe("");
    expect(execution.stderr.trim()).toBe([
      "Live Web acceptance failed.",
      "stage: configuration",
      "reason: LIVE_WEB_URL_REQUIRED",
    ].join("\n"));
  });

  it("pins the package command and dedicated config to only the acceptance file", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    const runner = read("scripts/run-live-web-acceptance.mjs");
    const acceptanceConfig = read("vitest.live-web.config.ts");

    expect(packageJson.scripts["accept:live-web"]).toBe(
      "node scripts/run-live-web-acceptance.mjs",
    );
    expect(runner).toContain('"../vitest.live-web.config.ts"');
    expect(runner).not.toMatch(/vitestEntry,\s*"run"\s*\]/u);
    expect(runner).toContain('stdio: ["ignore", "pipe", "ignore"]');
    expect(runner).not.toContain("execution.stderr");
    expect(acceptanceConfig).toContain(
      '"src/source-acquisition-security/__acceptance__/live-web-manual.acceptance.ts"',
    );
    expect(acceptanceConfig).toContain("disableConsoleIntercept: true");
    expect(acceptanceConfig.match(/live-web-manual\.acceptance\.ts/gu)).toHaveLength(1);
  });

  it("lists exactly the intended acceptance under the dedicated config", () => {
    const listed = spawnSync(
      process.execPath,
      [
        file("node_modules/vitest/vitest.mjs"),
        "list",
        "--config",
        file("vitest.live-web.config.ts"),
      ],
      {
        cwd: repositoryRoot,
        env: environmentWithoutLiveUrl("https://network-must-not-run.invalid/article"),
        encoding: "utf8",
      },
    );
    const discovered = listed.stdout.trim().split(/\r?\n/u).filter(Boolean);

    expect(listed.status).toBe(0);
    expect(discovered).toHaveLength(1);
    expect(discovered[0]).toContain(
      "src/source-acquisition-security/__acceptance__/live-web-manual.acceptance.ts",
    );
    expect(discovered[0]).not.toContain(".test.ts");
  });
});
