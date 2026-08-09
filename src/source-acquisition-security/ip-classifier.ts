import { isIP } from "node:net";
import type { IpFamily } from "./models";

export interface IpAddressClassification {
  address: string;
  family: IpFamily;
  allowed: boolean;
  category: "global-unicast" | "private" | "loopback" | "link-local" |
    "carrier-grade-nat" | "multicast" | "documentation" | "special-use";
}

const parseIpv4 = (address: string): number[] | undefined => {
  if (isIP(address) !== 4) return undefined;
  const bytes = address.split(".").map(Number);
  return bytes.length === 4 && bytes.every((value) =>
    Number.isInteger(value) && value >= 0 && value <= 255)
    ? bytes
    : undefined;
};

const inIpv4Range = (
  bytes: readonly number[],
  base: readonly number[],
  prefix: number,
): boolean => {
  const value = bytes.reduce((result, byte) => (result * 256) + byte, 0);
  const range = base.reduce((result, byte) => (result * 256) + byte, 0);
  const blockSize = 2 ** (32 - prefix);
  return Math.floor(value / blockSize) === Math.floor(range / blockSize);
};

const classifyIpv4 = (address: string): IpAddressClassification => {
  const bytes = parseIpv4(address);
  if (bytes === undefined) {
    return { address, family: 4, allowed: false, category: "special-use" };
  }
  const normalized = bytes.join(".");
  const ranges: Array<{
    base: number[];
    prefix: number;
    category: IpAddressClassification["category"];
  }> = [
    { base: [0, 0, 0, 0], prefix: 8, category: "special-use" },
    { base: [10, 0, 0, 0], prefix: 8, category: "private" },
    { base: [100, 64, 0, 0], prefix: 10, category: "carrier-grade-nat" },
    { base: [127, 0, 0, 0], prefix: 8, category: "loopback" },
    { base: [169, 254, 0, 0], prefix: 16, category: "link-local" },
    { base: [172, 16, 0, 0], prefix: 12, category: "private" },
    { base: [192, 0, 0, 0], prefix: 24, category: "special-use" },
    { base: [192, 0, 2, 0], prefix: 24, category: "documentation" },
    { base: [192, 88, 99, 0], prefix: 24, category: "special-use" },
    { base: [192, 168, 0, 0], prefix: 16, category: "private" },
    { base: [198, 18, 0, 0], prefix: 15, category: "special-use" },
    { base: [198, 51, 100, 0], prefix: 24, category: "documentation" },
    { base: [203, 0, 113, 0], prefix: 24, category: "documentation" },
    { base: [224, 0, 0, 0], prefix: 4, category: "multicast" },
    { base: [240, 0, 0, 0], prefix: 4, category: "special-use" },
  ];
  const match = ranges.find((range) =>
    inIpv4Range(bytes, range.base, range.prefix));
  return match === undefined
    ? { address: normalized, family: 4, allowed: true, category: "global-unicast" }
    : { address: normalized, family: 4, allowed: false, category: match.category };
};

const parseIpv6 = (address: string): number[] | undefined => {
  if (isIP(address) !== 6 || address.includes("%")) return undefined;
  let value = address.toLowerCase();
  const ipv4Match = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/u);
  if (ipv4Match !== null) {
    const ipv4 = parseIpv4(ipv4Match[1]);
    if (ipv4 === undefined) return undefined;
    const groups = [
      ((ipv4[0] ?? 0) << 8) | (ipv4[1] ?? 0),
      ((ipv4[2] ?? 0) << 8) | (ipv4[3] ?? 0),
    ];
    value = value.slice(0, -ipv4Match[1].length) +
      groups.map((group) => group.toString(16)).join(":");
  }
  const halves = value.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] === "" ? [] : halves[0]?.split(":") ?? [];
  const right = halves.length === 1 || halves[1] === ""
    ? []
    : halves[1]?.split(":") ?? [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) ||
      (halves.length === 2 && missing < 1)) return undefined;
  const groups = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ];
  if (groups.length !== 8 || groups.some((group) =>
    !/^[0-9a-f]{1,4}$/u.test(group))) return undefined;
  return groups.flatMap((group) => {
    const parsed = Number.parseInt(group, 16);
    return [parsed >> 8, parsed & 0xff];
  });
};

const inIpv6Range = (
  bytes: readonly number[],
  base: readonly number[],
  prefix: number,
): boolean => {
  const wholeBytes = Math.floor(prefix / 8);
  const remainingBits = prefix % 8;
  for (let index = 0; index < wholeBytes; index += 1) {
    if (bytes[index] !== base[index]) return false;
  }
  if (remainingBits === 0) return true;
  const mask = 0xff << (8 - remainingBits);
  return ((bytes[wholeBytes] ?? 0) & mask) ===
    ((base[wholeBytes] ?? 0) & mask);
};

const ipv6Base = (address: string): number[] => parseIpv6(address) ?? [];

export const classifyIpAddress = (address: string): IpAddressClassification => {
  if (isIP(address) === 4) return classifyIpv4(address);
  const bytes = parseIpv6(address);
  if (bytes === undefined) {
    return { address, family: 6, allowed: false, category: "special-use" };
  }
  const mapped = bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff && bytes[11] === 0xff;
  if (mapped) return classifyIpv4(bytes.slice(12).join("."));
  const normalized = Array.from({ length: 8 }, (_, index) =>
    (((bytes[index * 2] ?? 0) << 8) | (bytes[(index * 2) + 1] ?? 0))
      .toString(16)).join(":");
  const nonGlobal: Array<{
    base: string;
    prefix: number;
    category: IpAddressClassification["category"];
  }> = [
    { base: "2001::", prefix: 32, category: "special-use" },
    { base: "2001:2::", prefix: 48, category: "special-use" },
    { base: "2001:db8::", prefix: 32, category: "documentation" },
    { base: "2001:10::", prefix: 28, category: "special-use" },
    { base: "2001:20::", prefix: 28, category: "special-use" },
    { base: "2002::", prefix: 16, category: "special-use" },
    { base: "3fff::", prefix: 20, category: "documentation" },
  ];
  const globalPrefix = inIpv6Range(bytes, ipv6Base("2000::"), 3);
  const match = nonGlobal.find((range) =>
    inIpv6Range(bytes, ipv6Base(range.base), range.prefix));
  if (!globalPrefix || match !== undefined) {
    let category: IpAddressClassification["category"] =
      match?.category ?? "special-use";
    if (inIpv6Range(bytes, ipv6Base("fc00::"), 7)) category = "private";
    if (inIpv6Range(bytes, ipv6Base("fe80::"), 10)) category = "link-local";
    if (inIpv6Range(bytes, ipv6Base("ff00::"), 8)) category = "multicast";
    if (normalized === "0:0:0:0:0:0:0:1") category = "loopback";
    return { address: normalized, family: 6, allowed: false, category };
  }
  return {
    address: normalized,
    family: 6,
    allowed: true,
    category: "global-unicast",
  };
};

export const normalizeIpAddress = (address: string): string =>
  classifyIpAddress(address).address;
