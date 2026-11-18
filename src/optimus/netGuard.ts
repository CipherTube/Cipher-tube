import net from "node:net";
import dns from "node:dns/promises";

export type UrlVerdict =
  | { ok: true; url: URL; addresses: string[] }
  | { ok: false; reason: string };

/** Turn any IPv4 spelling (decimal, hex, octal, short form) into dotted quad, or null. */
export function normalizeIPv4(host: string): string | null {
  if (net.isIPv4(host)) return host;
  // Forms like 2130706433, 0x7f000001, 0177.0.0.1, 127.1 that URL and libc both accept.
  const parts = host.split(".");
  if (parts.length < 1 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^(0x[0-9a-f]+|0[0-7]*|[1-9]\d*)$/i.test(p)) return null;
    const n = /^0x/i.test(p) ? parseInt(p, 16) : /^0\d/.test(p) ? parseInt(p, 8) : parseInt(p, 10);
    if (!Number.isFinite(n)) return null;
    nums.push(n);
  }
  const last = nums[nums.length - 1];
  const lead = nums.slice(0, -1);
  if (lead.some((n) => n > 255)) return null;
  if (last >= 256 ** (4 - lead.length)) return null;
  let value = last;
  lead.forEach((n, i) => (value += n * 256 ** (3 - i)));
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

const v4 = (ip: string): number[] => ip.split(".").map(Number);

/** True for loopback, private, link-local, CGNAT, metadata, multicast, reserved. */
export function isBlockedIPv4(ip: string): boolean {
  const [a, b] = v4(ip);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isBlockedIPv6(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, "");
  if (ip === "::" || ip === "::1") return true;
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);
  const mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isBlockedIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return /^(fc|fd)/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip);
}

export type Resolver = (host: string) => Promise<string[]>;

const systemResolver: Resolver = async (host) => {
  const rows = await dns.lookup(host, { all: true });
  return rows.map((r) => r.address);
};

/**
 * Decide whether a URL may be fetched at all.
 * HTTPS only, no credentials in the URL, and every address the name resolves
 * to must be public. Resolution happens here so a hostname that points at a
 * private address is refused, not just a literal private IP.
 */
export async function vetUrl(input: string, resolve: Resolver = systemResolver): Promise<UrlVerdict> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "NOT_A_URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "NON_HTTPS_BLOCKED" };
  if (url.username || url.password) return { ok: false, reason: "CREDENTIALS_IN_URL_BLOCKED" };

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$/i.test(host) || /\.(localhost|local|internal)$/i.test(host)) {
    return { ok: false, reason: "LOCAL_HOSTNAME_BLOCKED" };
  }

  if (net.isIPv6(host)) {
    return isBlockedIPv6(host) ? { ok: false, reason: "PRIVATE_ADDRESS_BLOCKED" } : { ok: true, url, addresses: [host] };
  }
  const literal = normalizeIPv4(host);
  if (literal) {
    return isBlockedIPv4(literal) ? { ok: false, reason: "PRIVATE_ADDRESS_BLOCKED" } : { ok: true, url, addresses: [literal] };
  }

  let addrs: string[];
  try {
    addrs = await resolve(host);
  } catch {
    return { ok: false, reason: "DNS_RESOLUTION_FAILED" };
  }
  if (addrs.length === 0) return { ok: false, reason: "DNS_RESOLUTION_FAILED" };
  for (const a of addrs) {
    const blocked = net.isIPv6(a) ? isBlockedIPv6(a) : isBlockedIPv4(a);
    if (blocked) return { ok: false, reason: "RESOLVES_TO_PRIVATE_ADDRESS" };
  }
  return { ok: true, url, addresses: addrs };
}
