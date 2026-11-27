import { isIP } from "node:net";
import type { IncomingHttpHeaders } from "node:http";

export function clientIp(
  headers: IncomingHttpHeaders,
  remoteAddress: string | undefined,
): string {
  const forwarded = process.env.RENDER_EXTERNAL_URL
    ? headers["x-forwarded-for"]?.toString().split(",").at(-1)?.trim()
    : undefined;
  const value =
    forwarded && isIP(forwarded) ? forwarded : (remoteAddress ?? "");
  const normalized = value.startsWith("::ffff:") ? value.slice(7) : value;
  return isIP(normalized) ? normalized : "unknown";
}
