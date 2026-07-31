export function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
  return crypto.randomUUID();
}
