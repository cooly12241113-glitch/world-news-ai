import ts from "typescript";

const FORBIDDEN_MODULES = new Set([
  "node:http", "http", "node:https", "https", "node:net", "net",
  "node:tls", "tls", "node:dgram", "dgram", "undici", "axios", "got",
  "node-fetch", "request", "superagent",
]);

export const AUTHORIZED_NETWORK_MODULE_IMPORTS = new Map<string, ReadonlySet<string>>([
  ["src/source-acquisition-security/pinned-transport.ts",
    new Set(["node:http", "node:https", "node:net", "node:tls"])],
  ["src/source-acquisition-security/response-head-transport.ts",
    new Set(["node:http", "node:https", "node:net", "node:tls"])],
]);

const netIsIpPermission = new Map<string, ReadonlySet<string>>([
  ["node:net", new Set(["isIP"])],
  ["net", new Set(["isIP"])],
]);

export const AUTHORIZED_NON_IO_SYMBOL_IMPORTS = new Map<
  string,
  ReadonlyMap<string, ReadonlySet<string>>
>([
  ["src/source-acquisition-security/ip-classifier.ts", netIsIpPermission],
  ["src/source-acquisition-security/url-validator.ts", netIsIpPermission],
  ["src/ingestion/url-policy.ts", netIsIpPermission],
]);

export const AUTHORIZED_NETWORK_IO_MODULES = new Set([
  "src/source-acquisition-security/pinned-transport.ts",
  "src/source-acquisition-security/response-head-transport.ts",
]);

export interface NetworkAuthorityViolation {
  kind: "forbidden-module" | "fetch-reference";
  value: string;
}

const normalizedPath = (path: string): string => path.replaceAll("\\", "/");

export const inspectNetworkAuthoritySource = (
  path: string,
  source: string,
  broadAllowlist = AUTHORIZED_NETWORK_MODULE_IMPORTS,
  symbolAllowlist = AUTHORIZED_NON_IO_SYMBOL_IMPORTS,
): NetworkAuthorityViolation[] => {
  const normalized = normalizedPath(path);
  const allowedModules = broadAllowlist.get(normalized) ?? new Set<string>();
  const allowedSymbolsByModule = symbolAllowlist.get(normalized);
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations: NetworkAuthorityViolation[] = [];
  const addModule = (value: string): void => {
    if (FORBIDDEN_MODULES.has(value) && !allowedModules.has(value)) {
      violations.push({ kind: "forbidden-module", value });
    }
  };
  const inspectStaticImport = (node: ts.ImportDeclaration, moduleName: string): void => {
    if (!FORBIDDEN_MODULES.has(moduleName) || allowedModules.has(moduleName)) return;

    const allowedSymbols = allowedSymbolsByModule?.get(moduleName);
    const bindings = node.importClause?.namedBindings;
    if (allowedSymbols === undefined || bindings === undefined ||
        !ts.isNamedImports(bindings) || node.importClause?.name !== undefined ||
        bindings.elements.length === 0 ||
        bindings.elements.some((element) => {
          const importedName = element.propertyName?.text ?? element.name.text;
          return !allowedSymbols.has(importedName);
        })) {
      violations.push({ kind: "forbidden-module", value: moduleName });
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      inspectStaticImport(node, node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) &&
        node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
      addModule(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.arguments.length > 0 &&
        ((node.expression.kind === ts.SyntaxKind.ImportKeyword) ||
         (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      const first = node.arguments[0];
      if (first !== undefined && ts.isStringLiteral(first)) addModule(first.text);
    }
    if (ts.isIdentifier(node) && node.text === "fetch") {
      const declarationName = ts.isPropertySignature(node.parent) ||
        ts.isPropertyDeclaration(node.parent) || ts.isMethodDeclaration(node.parent);
      if (!declarationName) {
        violations.push({ kind: "fetch-reference", value: "fetch" });
      }
    }
    if (ts.isElementAccessExpression(node) &&
        node.argumentExpression !== undefined &&
        ts.isStringLiteral(node.argumentExpression) &&
        node.argumentExpression.text === "fetch") {
      violations.push({ kind: "fetch-reference", value: "fetch" });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return violations;
};
