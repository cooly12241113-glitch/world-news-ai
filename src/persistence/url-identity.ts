const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

const SENSITIVE_PARAMETERS = new Set([
  "access_token",
  "api_key",
  "apikey",
  "auth",
  "authorization",
  "key",
  "password",
  "secret",
  "signature",
  "token",
]);

const sortedUrl = (url: URL): string => {
  const entries = [...url.searchParams.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
  );
  url.search = "";
  for (const [key, value] of entries) {
    url.searchParams.append(key, value);
  }
  return url.toString();
};

export const redactSensitiveQueryParameters = (value: string): string => {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_PARAMETERS.has(key.toLowerCase())) {
      url.searchParams.set(key, "[REDACTED]");
    }
  }
  return sortedUrl(url);
};

export const sanitizeUrlForLogging = (
  value: string | undefined,
): string | undefined => {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.hash = "";
    return redactSensitiveQueryParameters(url.toString());
  } catch {
    return undefined;
  }
};

export const normalizeUrlForIdentity = (value: string): string => {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Document identity requires an HTTP(S) URL");
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    const normalized = key.toLowerCase();
    if (
      TRACKING_PARAMETERS.has(normalized) ||
      SENSITIVE_PARAMETERS.has(normalized)
    ) {
      url.searchParams.delete(key);
    }
  }
  return sortedUrl(url);
};

export const resolveCanonicalUrl = (
  canonicalUrl: string | undefined,
  fallbackUrl: string,
): string => normalizeUrlForIdentity(canonicalUrl ?? fallbackUrl);
