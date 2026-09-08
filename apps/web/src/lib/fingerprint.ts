"use client";

/**
 * A lightweight device signal used to make ban evasion cost something.
 *
 * Explicitly *not* an identity. Modern browsers actively randomise several of
 * these values, privacy extensions spoof them, and a household sharing one
 * laptop will legitimately produce a single fingerprint for several people.
 * It therefore feeds moderation decisions as one signal among others — it never
 * decides one on its own, and a ban that rests only on this is a bad ban.
 *
 * Dependency-free on purpose: FingerprintJS and friends are heavier than the
 * entire rest of the landing bundle and would pull a third-party script into a
 * product whose whole premise is not having any.
 */
export async function computeFingerprint(): Promise<string> {
  const parts: string[] = [];

  try {
    parts.push(navigator.userAgent);
    parts.push(navigator.language);
    parts.push(String(navigator.hardwareConcurrency ?? 0));
    parts.push(String((navigator as { deviceMemory?: number }).deviceMemory ?? 0));
    parts.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
    parts.push(String(new Date().getTimezoneOffset()));
    parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
    parts.push(String(navigator.maxTouchPoints ?? 0));
  } catch {
    /* individual probes may be blocked; a partial fingerprint is still useful */
  }

  // Canvas rendering differs subtly by GPU, driver and font stack. Cheap, and
  // meaningfully more distinguishing than the plain attributes above.
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 100, 25);
      ctx.fillStyle = "#069";
      ctx.fillText("callme-fp-\u{1F310}", 2, 15);
      parts.push(canvas.toDataURL().slice(-96));
    }
  } catch {
    /* canvas blocked */
  }

  // WebGL vendor/renderer survives some spoofing that touches the 2D canvas.
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl && ext) {
      parts.push(String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)));
      parts.push(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)));
    }
  } catch {
    /* webgl unavailable */
  }

  const encoded = new TextEncoder().encode(parts.join("|"));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let cached: Promise<string> | null = null;

/** Memoised — the value is stable for the page's lifetime. */
export function getFingerprint(): Promise<string> {
  cached ??= computeFingerprint().catch(() => "");
  return cached;
}
