import { createHash } from "node:crypto";
import { classifyIpAddress } from "./ip-classifier";
import {
  TargetSecurityError,
  type ApprovedEgressTarget,
  type DnsResolver,
} from "./models";
import { validateNetworkTarget } from "./url-validator";

const approvedTargets = new WeakSet<object>();

const fingerprint = (value: object): string => createHash("sha256")
  .update(JSON.stringify(value))
  .digest("hex");

export const approveEgressTarget = async (
  input: unknown,
  resolver: DnsResolver,
): Promise<ApprovedEgressTarget> => {
  const target = validateNetworkTarget(input);
  const resolved = target.literalAddress === undefined
    ? await resolver.resolve(target.originalHostname).catch((error: unknown) => {
      if (error instanceof TargetSecurityError) throw error;
      throw new TargetSecurityError("DNS_RESOLUTION_FAILED");
    })
    : [{
      address: target.literalAddress,
      family: classifyIpAddress(target.literalAddress).family,
    }];
  if (resolved.length === 0) {
    throw new TargetSecurityError("DNS_RESOLUTION_FAILED");
  }
  const classifications = resolved.map(({ address }) => classifyIpAddress(address));
  const allowedCount = classifications.filter(({ allowed }) => allowed).length;
  if (allowedCount > 0 && allowedCount !== classifications.length) {
    throw new TargetSecurityError("DNS_MIXED_ADDRESS_SET");
  }
  if (allowedCount === 0) {
    throw new TargetSecurityError("UNSAFE_IP_ADDRESS");
  }
  const selected = [...classifications].sort((left, right) =>
    left.family - right.family || left.address.localeCompare(right.address))[0];
  if (selected === undefined) {
    throw new TargetSecurityError("DNS_RESOLUTION_FAILED");
  }
  const lineage = {
    scheme: target.scheme,
    originalHostname: target.originalHostname,
    effectivePort: target.effectivePort,
    pinnedIp: selected.address,
    family: selected.family,
  };
  const approved = Object.freeze({
    ...lineage,
    pathAndQuery: target.pathAndQuery,
    approvalFingerprint: fingerprint(lineage),
  }) as ApprovedEgressTarget;
  approvedTargets.add(approved);
  return approved;
};

export const assertApprovedEgressTarget = (
  target: ApprovedEgressTarget,
): void => {
  if (typeof target !== "object" || target === null ||
      !approvedTargets.has(target)) {
    throw new TargetSecurityError("INVALID_NETWORK_TARGET");
  }
};
