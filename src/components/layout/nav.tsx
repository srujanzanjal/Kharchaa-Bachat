"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { SecretModeModal } from "@/components/secret/secret-mode-modal";

/** Minimal inline SVG icons — avoids pulling in an icon library for 4 icons */
const icons: Record<string, React.ReactNode> = {
  home: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7.5L10 2l7 5.5V17a1 1 0 01-1 1h-3.5v-5h-5v5H4a1 1 0 01-1-1V7.5z" />
    </svg>
  ),
  add: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="4" x2="10" y2="16" />
      <line x1="4" y1="10" x2="16" y2="10" />
    </svg>
  ),
  recap: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M7 13v-3" />
      <path d="M10 13v-6" />
      <path d="M13 13v-4" />
    </svg>
  ),
  history: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7.5" />
      <polyline points="10 5.5 10 10 13 12.5" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M16.5 12.5a1.5 1.5 0 00.3 1.65l.05.05a1.82 1.82 0 01-1.29 3.1 1.82 1.82 0 01-1.28-.53l-.05-.05a1.5 1.5 0 00-1.65-.3 1.5 1.5 0 00-.91 1.37v.14a1.82 1.82 0 01-3.64 0v-.07a1.5 1.5 0 00-.98-1.37 1.5 1.5 0 00-1.65.3l-.05.05a1.82 1.82 0 01-2.57-2.57l.05-.05a1.5 1.5 0 00.3-1.65 1.5 1.5 0 00-1.37-.91h-.14a1.82 1.82 0 010-3.64h.07a1.5 1.5 0 001.37-.98 1.5 1.5 0 00-.3-1.65l-.05-.05a1.82 1.82 0 012.57-2.57l.05.05a1.5 1.5 0 001.65.3h.07a1.5 1.5 0 00.91-1.37v-.14a1.82 1.82 0 013.64 0v.07a1.5 1.5 0 00.91 1.37 1.5 1.5 0 001.65-.3l.05-.05a1.82 1.82 0 012.57 2.57l-.05.05a1.5 1.5 0 00-.3 1.65v.07a1.5 1.5 0 001.37.91h.14a1.82 1.82 0 010 3.64h-.07a1.5 1.5 0 00-1.37.91z" />
    </svg>
  ),
};

export function Nav() {
  const pathname = usePathname();
  const [isSecretModeOpen, setIsSecretModeOpen] = useState(false);

  // 7-tap detection on the logo (sliding window with auto-reset)
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogoTap = (e: React.MouseEvent) => {
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }

    tapCountRef.current += 1;

    if (tapCountRef.current >= 7) {
      e.preventDefault();
      tapCountRef.current = 0;
      setIsSecretModeOpen(true);
      return;
    }

    // Reset tap counter after 800ms of inactivity
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 800);

    // If rapidly tapping (count > 1), prevent page reloads
    if (tapCountRef.current > 1) {
      e.preventDefault();
    }
  };

  return (
    <>
      {/* ── Mobile top bar ──────────────────────────────── */}
      <header className="flex h-12 items-center justify-between border-b border-border/50 px-5 md:hidden">
        <Link
          href="/"
          onClick={handleLogoTap}
          className="text-[0.875rem] font-semibold tracking-tight text-text-primary select-none touch-manipulation"
          title="kharchaa bachat"
        >
          kharchaa bachat
        </Link>
        <Link
          href="/dev"
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-opacity opacity-40 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
          title="Developer Diagnostics"
          aria-label="Developer Diagnostics"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </Link>
      </header>

      {/* ── Mobile bottom nav ────────────────────────────── */}
      <nav
        aria-label="Main navigation"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-bg-primary/95 backdrop-blur-sm md:hidden"
      >
        <ul className="flex items-stretch justify-around">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const isAdd = item.id === "add";

            return (
              <li key={item.id} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-2 pt-2.5",
                    "min-h-[56px] touch-manipulation",
                    "transition-colors duration-150",
                    "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
                    isAdd && active && "text-accent",
                    isAdd && !active && "text-text-secondary",
                    !isAdd && active && "text-text-primary",
                    !isAdd && !active && "text-text-tertiary hover:text-text-secondary"
                  )}
                >
                  <span className={cn(
                    isAdd && "flex h-8 w-8 items-center justify-center rounded-full",
                    isAdd && active && "bg-accent text-white",
                    isAdd && !active && "bg-bg-tertiary"
                  )}>
                    {icons[item.id]}
                  </span>
                  <span className="text-[0.625rem] font-medium leading-none">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {/* Safe area padding for iOS */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      {/* ── Desktop top nav ──────────────────────────────── */}
      <nav
        aria-label="Main navigation"
        className="hidden border-b border-border md:block"
      >
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-6">
          <Link
            href="/"
            onClick={handleLogoTap}
            className="text-[0.875rem] font-semibold tracking-tight text-text-primary select-none cursor-pointer"
            title="kharchaa bachat"
          >
            kharchaa bachat
          </Link>
          <div className="flex items-center gap-4">
            <ul className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-[0.8125rem] font-medium",
                        "transition-colors duration-150",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        active
                          ? "text-text-primary"
                          : "text-text-tertiary hover:text-text-secondary"
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Subtle Developer Icon */}
            <Link
              href="/dev"
              className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary transition-opacity opacity-40 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              title="Developer Diagnostics"
              aria-label="Developer Diagnostics"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Secret Mode Modal ────────────────────────────── */}
      <SecretModeModal
        isOpen={isSecretModeOpen}
        onClose={() => setIsSecretModeOpen(false)}
      />
    </>
  );
}

