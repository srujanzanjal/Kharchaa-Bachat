/**
 * Kharchaa Bachat Mobile Shell - Central Configuration
 *
 * ARCHITECTURAL RULE:
 * This mobile shell communicates strictly over public HTTPS to the deployed Next.js web application.
 * It contains ZERO database URLs, PostgreSQL credentials, or Supabase keys.
 */

// Production web application URL (Vercel deployment)
export const PRODUCTION_WEB_APP_URL = "https://kharchaa-bachat.vercel.app/";

// Base URL allows runtime override via EXPO_PUBLIC_WEB_APP_URL for staging or local testing
export const WEB_APP_URL =
  process.env.EXPO_PUBLIC_WEB_APP_URL || PRODUCTION_WEB_APP_URL;

/**
 * Checks whether a requested URL is internal to Kharchaa Bachat
 * or an external link that should be opened in the system browser.
 */
export function isInternalUrl(targetUrl: string, baseUrl: string = WEB_APP_URL): boolean {
  try {
    if (!targetUrl || targetUrl === "about:blank") {
      return true;
    }

    const target = new URL(targetUrl);
    const base = new URL(baseUrl);

    // Host matches or is a subdomain of the base host
    if (target.hostname === base.hostname || target.hostname.endsWith(`.${base.hostname}`)) {
      return true;
    }

    // Localhost / 127.0.0.1 allowance for local development
    if (
      (target.hostname === "localhost" || target.hostname === "127.0.0.1") &&
      (base.hostname === "localhost" || base.hostname === "127.0.0.1")
    ) {
      return true;
    }

    return false;
  } catch {
    // If URL parsing fails, treat relative paths or unknown protocols safely
    if (targetUrl.startsWith("/")) {
      return true;
    }
    return false;
  }
}
