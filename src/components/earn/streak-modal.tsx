"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { paiseToRupees } from "@/lib/money";
import type { UserStreakData } from "@/types";

interface StreakModalProps {
  isOpen: boolean;
  onClose: () => void;
  streak: UserStreakData;
  userName: string;
}

export function StreakModal({
  isOpen,
  onClose,
  streak,
  userName,
}: StreakModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${userName}'s streak status`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* ── Backdrop ─────────────────────────────────── */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity duration-300 animate-fade-in"
      />

      {/* ── Modal Card ───────────────────────────────── */}
      <div
        className={cn(
          "relative z-10 w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-border/80 bg-bg-secondary/95 p-6 shadow-2xl backdrop-blur-xl",
          "animate-slide-up"
        )}
      >
        {/* Subtle decorative glow */}
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-accent/15 blur-3xl"
          aria-hidden="true"
        />

        {/* Header */}
        <div className="flex items-center justify-between pb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm select-none" aria-hidden="true">
              🔥
            </span>
            <span className="type-caption font-semibold tracking-wider text-accent">
              {userName}&apos;s Streak
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none -mr-2"
            aria-label="Close streak modal"
          >
            <span className="text-base leading-none">✕</span>
          </button>
        </div>

        {/* Central Streak Badge */}
        <div className="my-3 flex flex-col items-center justify-center rounded-xl border border-border/60 bg-bg-primary/50 py-5 text-center">
          <div className="flex items-center gap-2 text-3xl sm:text-4xl font-bold text-text-primary">
            <span className="select-none animate-pulse-subtle">🔥</span>
            <span>{streak.current_streak}</span>
            <span className="text-lg sm:text-xl font-normal text-text-secondary uppercase tracking-wider">
              {streak.current_streak === 1 ? "day" : "days"}
            </span>
          </div>
          <p className="type-caption text-text-tertiary mt-1">
            {streak.current_streak > 0
              ? "Keep it up with 1 challenge daily"
              : "Solve 1 challenge today to start"}
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-2 my-3">
          <div className="rounded-lg border border-border/50 bg-bg-tertiary/40 px-3 py-2 text-center">
            <p className="type-caption text-text-tertiary text-[0.625rem]">
              Streak Earnings
            </p>
            <p className="type-body font-semibold text-positive mt-0.5">
              +₹{paiseToRupees(streak.streak_earnings_paise)}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-bg-tertiary/40 px-3 py-2 text-center">
            <p className="type-caption text-text-tertiary text-[0.625rem]">
              Best Streak
            </p>
            <p className="type-body font-semibold text-text-primary mt-0.5">
              {streak.best_streak} {streak.best_streak === 1 ? "day" : "days"}
            </p>
          </div>
        </div>

        {/* Streak Rewards Checklist */}
        <div className="mt-4">
          <p className="type-caption text-text-secondary mb-2">Streak Rewards</p>
          <div className="space-y-1.5">
            {streak.milestones.map((m) => {
              const isUnlocked = m.is_unlocked;
              return (
                <div
                  key={m.days}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors",
                    isUnlocked
                      ? "border border-positive/30 bg-positive/10 text-text-primary"
                      : "border border-border/60 bg-bg-tertiary/30 text-text-tertiary"
                  )}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <span>{isUnlocked ? "✓" : "🔒"}</span>
                    <span>{m.days} days</span>
                  </div>
                  <span
                    className={cn(
                      "font-semibold",
                      isUnlocked ? "text-positive" : "text-text-tertiary"
                    )}
                  >
                    +₹{paiseToRupees(m.reward_paise)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Next Reward Banner */}
        {streak.next_milestone ? (
          <div className="mt-4 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-center">
            <p className="type-caption text-text-secondary text-[0.6875rem]">
              Next Reward
            </p>
            <p className="type-body-sm font-semibold text-accent mt-0.5">
              🔥 {streak.next_milestone.days} days → +₹
              {paiseToRupees(streak.next_milestone.reward_paise)}
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-center">
            <p className="type-body-sm font-semibold text-positive">
              🏆 All milestones unlocked!
            </p>
          </div>
        )}

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-bg-tertiary px-4 py-2.5 text-xs font-semibold text-text-primary transition-colors hover:bg-border active:scale-[0.99] focus-visible:outline-none"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
