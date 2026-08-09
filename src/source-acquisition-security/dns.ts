import { promises as dns } from "node:dns";
import type { DnsResolver } from "./models";

export class NodeDnsResolver implements DnsResolver {
  async resolve(hostname: string) {
    return dns.lookup(hostname, { all: true, verbatim: true });
  }
}
