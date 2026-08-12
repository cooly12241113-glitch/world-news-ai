import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTHORIZED_NON_IO_SYMBOL_IMPORTS,
  AUTHORIZED_NETWORK_IO_MODULES,
  AUTHORIZED_NETWORK_MODULE_IMPORTS,
  inspectNetworkAuthoritySource,
} from "./network-authority-guard";

const productionFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return name === "__tests__" ? [] : productionFiles(path);
    }
    return /\.tsx?$/u.test(path) ? [path.replaceAll("\\", "/")] : [];
  });

describe("network authority architecture allowlist", () => {
  it("allows low-level modules only through explicit per-file imports", () => {
    const files = [
      ...productionFiles("src/ingestion"),
      ...productionFiles("src/source-connector"),
      ...productionFiles("src/source-acquisition-security"),
      ...productionFiles("src/acquisition-orchestration"),
    ];
    for (const path of files) {
      expect(
        inspectNetworkAuthoritySource(path, readFileSync(path, "utf8")),
        path,
      ).toEqual([]);
    }
    expect([...AUTHORIZED_NETWORK_IO_MODULES].sort()).toEqual([
      "src/source-acquisition-security/pinned-transport.ts",
      "src/source-acquisition-security/response-head-transport.ts",
    ]);
    expect(AUTHORIZED_NETWORK_MODULE_IMPORTS.has("src/ingestion/url-policy.ts"))
      .toBe(false);
    expect(AUTHORIZED_NON_IO_SYMBOL_IMPORTS.get("src/ingestion/url-policy.ts")?.get("node:net"))
      .toEqual(new Set(["isIP"]));
  });

  it.each([
    ["direct fetch", "fetch(url)"],
    ["global fetch alias", "const f = globalThis.fetch; f(url)"],
    ["global fetch destructuring", "const { fetch: f } = globalThis; f(url)"],
    ["computed fetch alias", "const f = globalThis['fetch']; f(url)"],
    ["https alias", "import { request as r } from 'node:https'; r(url)"],
    ["http namespace", "import * as h from 'node:http'; h.request(url)"],
    ["net socket", "import { connect } from 'net'; connect(80)"],
    ["dynamic client import", "const client = await import('undici')"],
    ["require alias", "const h = require('https')"],
    ["imported client", "import axios from 'axios'; axios.get(url)"],
  ])("rejects synthetic %s", (_name, source) => {
    expect(inspectNetworkAuthoritySource("src/ingestion/synthetic.ts", source))
      .not.toEqual([]);
  });

  it("allows an ordinary materialized-content module", () => {
    expect(inspectNetworkAuthoritySource(
      "src/ingestion/ordinary.ts",
      "export const normalize = (value: string) => value.trim();",
    )).toEqual([]);
  });

  it("allows the same low-level import only for an explicitly authorized module", () => {
    expect(inspectNetworkAuthoritySource(
      "src/source-acquisition-security/pinned-transport.ts",
      "import https from 'node:https'; https.request({});",
    )).toEqual([]);
  });

  it("allows only the exact isIP symbol in restricted utility files", () => {
    expect(inspectNetworkAuthoritySource(
      "src/source-acquisition-security/ip-classifier.ts",
      "import { isIP } from 'node:net'; isIP('127.0.0.1');",
    )).toEqual([]);
  });

  it.each([
    [
      "Auditor named connect reproducer",
      "src/source-acquisition-security/ip-classifier.ts",
      "import { connect } from 'node:net'; connect(80)",
    ],
    [
      "Auditor namespace connect reproducer",
      "src/ingestion/url-policy.ts",
      "import * as net from 'node:net'; net.connect(80)",
    ],
    [
      "mixed named import",
      "src/source-acquisition-security/ip-classifier.ts",
      "import { isIP, connect } from 'node:net'; connect(80)",
    ],
    [
      "namespace with isIP-only use",
      "src/source-acquisition-security/ip-classifier.ts",
      "import * as net from 'node:net'; net.isIP('127.0.0.1')",
    ],
    [
      "default import",
      "src/source-acquisition-security/ip-classifier.ts",
      "import net from 'node:net'; net.isIP('127.0.0.1')",
    ],
    [
      "bare net connect alias",
      "src/source-acquisition-security/ip-classifier.ts",
      "import { connect } from 'net'; connect(80)",
    ],
    [
      "require module object",
      "src/source-acquisition-security/ip-classifier.ts",
      "const net = require('node:net'); net.isIP('127.0.0.1')",
    ],
    [
      "dynamic module object",
      "src/source-acquisition-security/ip-classifier.ts",
      "const net = await import('node:net'); net.isIP('127.0.0.1')",
    ],
  ])("rejects restricted utility %s", (_name, path, source) => {
    expect(inspectNetworkAuthoritySource(path, source)).not.toEqual([]);
  });

  it("applies the same isIP-only restriction to the bare net spelling", () => {
    expect(inspectNetworkAuthoritySource(
      "src/source-acquisition-security/ip-classifier.ts",
      "import { isIP } from 'net'; isIP('127.0.0.1');",
    )).toEqual([]);
  });

  it("still rejects fetch or an unapproved client inside an allowlisted file", () => {
    expect(inspectNetworkAuthoritySource(
      "src/source-acquisition-security/pinned-transport.ts",
      "import https from 'node:https'; const f = globalThis.fetch;",
    )).toContainEqual({ kind: "fetch-reference", value: "fetch" });
    expect(inspectNetworkAuthoritySource(
      "src/source-acquisition-security/pinned-transport.ts",
      "import axios from 'axios';",
    )).toContainEqual({ kind: "forbidden-module", value: "axios" });
  });
});
