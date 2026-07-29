function canonicalize(value: unknown): unknown {
  if (typeof value === "string") {
    return value.normalize("NFC");
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

// Synchronous SHA-256 keeps deterministic domain fingerprints portable across
// Node and browser adapters without introducing a runtime dependency.
export function createSha256Fingerprint(input: string): string {
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));
  const maxWord = 2 ** 32;
  const words: number[] = [];
  const hash: number[] = [];
  const constants: number[] = [];
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const padded = [...bytes, 0x80];
  while (padded.length % 64 !== 56) padded.push(0);
  const high = Math.floor(bitLength / maxWord);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) padded.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) padded.push((low >>> shift) & 0xff);
  for (let candidate = 2; constants.length < 64; candidate += 1) {
    let prime = true;
    for (let divisor = 2; divisor * divisor <= candidate; divisor += 1) {
      if (candidate % divisor === 0) { prime = false; break; }
    }
    if (prime) {
      if (hash.length < 8) hash.push((Math.sqrt(candidate) * maxWord) | 0);
      constants.push((Math.cbrt(candidate) * maxWord) | 0);
    }
  }
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      words[index] = (
        (padded[start]! << 24) |
        (padded[start + 1]! << 16) |
        (padded[start + 2]! << 8) |
        padded[start + 3]!
      );
    }
    for (let index = 16; index < 64; index += 1) {
      const word15 = words[index - 15]!;
      const word2 = words[index - 2]!;
      const sigma0 = rightRotate(word15, 7) ^ rightRotate(word15, 18) ^ (word15 >>> 3);
      const sigma1 = rightRotate(word2, 17) ^ rightRotate(word2, 19) ^ (word2 >>> 10);
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rightRotate(e!, 6) ^ rightRotate(e!, 11) ^ rightRotate(e!, 25);
      const choice = (e! & f!) ^ (~e! & g!);
      const temporary1 = (h! + sum1 + choice + constants[index]! + words[index]!) | 0;
      const sum0 = rightRotate(a!, 2) ^ rightRotate(a!, 13) ^ rightRotate(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temporary2 = (sum0 + majority) | 0;
      h = g; g = f; f = e; e = (d! + temporary1) | 0;
      d = c; c = b; b = a; a = (temporary1 + temporary2) | 0;
    }
    hash[0] = (hash[0]! + a!) | 0; hash[1] = (hash[1]! + b!) | 0;
    hash[2] = (hash[2]! + c!) | 0; hash[3] = (hash[3]! + d!) | 0;
    hash[4] = (hash[4]! + e!) | 0; hash[5] = (hash[5]! + f!) | 0;
    hash[6] = (hash[6]! + g!) | 0; hash[7] = (hash[7]! + h!) | 0;
  }
  return hash.map((word) => (word >>> 0).toString(16).padStart(8, "0")).join("");
}

export function createSemanticFingerprint(value: unknown): string {
  return createSha256Fingerprint(JSON.stringify(canonicalize(value)));
}
