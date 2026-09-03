"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  fetchEarnStatus,
  fetchNextChallenge,
  submitChallengeAnswer,
} from "@/lib/data/earn";
import {
  CHALLENGE_TYPE_ICONS,
  CHALLENGE_TYPE_LABELS,
  DIFFICULTY_LABELS,
} from "@/lib/constants";
import { StreakModal } from "@/components/earn/streak-modal";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { EarnAttemptResult, EarnChallenge, EarnStatus } from "@/types";

type EarnPhase = "loading" | "select_profile" | "challenge" | "result" | "daily_limit" | "error";

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getStoredProfileSnapshot(): "srujan" | "disha" | null {
  try {
    const val = localStorage.getItem("kb_earn_profile");
    if (val === "srujan" || val === "disha") return val;
  } catch {
    // Ignore
  }
  return null;
}

function getServerProfileSnapshot(): "srujan" | "disha" | null {
  return null;
}

export default function EarnPage() {
  const profile = useSyncExternalStore(
    subscribeToStorage,
    getStoredProfileSnapshot,
    getServerProfileSnapshot
  );

  const [phase, setPhase] = useState<EarnPhase>("loading");
  const [status, setStatus] = useState<EarnStatus | null>(null);
  const [challenge, setChallenge] = useState<EarnChallenge | null>(null);
  const [answer, setAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [result, setResult] = useState<EarnAttemptResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [isStreakModalOpen, setIsStreakModalOpen] = useState(false);

  const effectivePhase: EarnPhase = !profile ? "select_profile" : phase;

  // Fetch challenge and status whenever profile or reloadTrigger changes
  useEffect(() => {
    if (!profile) return;

    let isMounted = true;

    async function loadData() {
      try {
        const res = await fetchEarnStatus(profile!);
        if (!isMounted) return;

        if (res.status === "success" && res.data) {
          setStatus(res.data);
          if (res.data.daily_limit_reached) {
            setPhase("daily_limit");
            return;
          }
        }

        const chalRes = await fetchNextChallenge(profile!);
        if (!isMounted) return;

        if (chalRes.status === "success" && chalRes.data) {
          setChallenge(chalRes.data);
          setAnswer("");
          setSelectedOption(null);
          setResult(null);
          setPhase("challenge");
        } else {
          setErrorMessage(chalRes.error || "Failed to load challenge.");
          setPhase("error");
        }
      } catch (err) {
        if (!isMounted) return;
        setErrorMessage(
          err instanceof Error ? err.message : "We can’t reach your data right now."
        );
        setPhase("error");
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [profile, reloadTrigger]);

  const handleSelectProfile = (name: "srujan" | "disha") => {
    setPhase("loading");
    try {
      localStorage.setItem("kb_earn_profile", name);
      window.dispatchEvent(new Event("storage"));
    } catch {
      // Ignore
    }
  };

  const handleSubmit = async () => {
    if (!profile || !challenge || isSubmitting) return;

    const submittedAnswer = challenge.options ? (selectedOption || "") : answer.trim();
    if (!submittedAnswer) return;

    setIsSubmitting(true);

    const idempotencyKey = crypto.randomUUID();
    const res = await submitChallengeAnswer({
      profileName: profile,
      challengeId: challenge.id,
      submittedAnswer,
      idempotencyKey,
    });

    setIsSubmitting(false);

    if (res.status === "success" && res.data) {
      setResult(res.data);
      // Refresh status
      const statusRes = await fetchEarnStatus(profile);
      if (statusRes.status === "success" && statusRes.data) {
        setStatus(statusRes.data);
      }
      if (res.data.daily_limit_reached) {
        setPhase("daily_limit");
      } else {
        setPhase("result");
      }
    } else {
      setErrorMessage(res.error || "Submission failed.");
      setPhase("error");
    }
  };

  const handleNextChallenge = () => {
    setPhase("loading");
    setReloadTrigger((prev) => prev + 1);
  };

  const handleSwitchProfile = () => {
    setChallenge(null);
    setResult(null);
    setStatus(null);
    setPhase("loading");
    try {
      localStorage.removeItem("kb_earn_profile");
      window.dispatchEvent(new Event("storage"));
    } catch {
      // Ignore
    }
  };

  const handleRetry = () => {
    setPhase("loading");
    setErrorMessage(null);
    if (profile) {
      setReloadTrigger((prev) => prev + 1);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-5 md:px-6 pt-8 md:pt-12 pb-24">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="💰 Earn lil Kharchaa"
          subtitle="Solve something. Earn a little."
        />
        {status?.streak && profile && (
          <button
            type="button"
            onClick={() => setIsStreakModalOpen(true)}
            aria-label={`View ${profile === "srujan" ? "Srujan" : "Disha"}'s streak details`}
            className="mt-1 flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 transition-all duration-150 hover:border-accent hover:bg-accent/20 active:scale-95 focus-visible:outline-none"
          >
            <span className="text-base select-none">🔥</span>
            <span className="type-body-sm font-bold text-accent">
              {status.streak.current_streak}
            </span>
          </button>
        )}
      </div>

      {/* ── Daily Progress & Streak Breakdown ───────────── */}
      {status && (
        <section className="mt-6 rounded-lg border border-border bg-bg-secondary/70 p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="type-caption text-text-tertiary">Today&apos;s Earn</span>
            <span className="type-title-sm text-text-primary font-bold">
              {formatPaise(status.today_total_earned_paise)}
            </span>
          </div>

          {/* Sub-breakdown: Games vs Streak */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-text-secondary">
                <span aria-hidden="true">💰</span>
                <span>Games</span>
              </span>
              <span className="type-mono font-medium text-text-primary">
                {formatPaise(status.today_game_earned_paise)} / {formatPaise(status.daily_game_limit_paise)}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-bg-tertiary overflow-hidden">
              <div
                className="h-full rounded-full bg-positive transition-all duration-500"
                style={{
                  width: `${Math.min(100, (status.today_game_earned_paise / status.daily_game_limit_paise) * 100)}%`,
                }}
              />
            </div>
          </div>

          {status.today_streak_earned_paise > 0 && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
              <span className="flex items-center gap-1.5 text-accent font-medium">
                <span aria-hidden="true">🔥</span>
                <span>Streak bonus</span>
              </span>
              <span className="type-mono font-bold text-accent">
                +{formatPaise(status.today_streak_earned_paise)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between text-[0.75rem] text-text-tertiary pt-1">
            <span>
              {status.daily_limit_reached
                ? "Game limit reached for today"
                : `Game remaining: ${formatPaise(status.remaining_game_paise)}`}
            </span>
            {profile && (
              <button
                type="button"
                onClick={handleSwitchProfile}
                className="text-text-tertiary hover:text-text-secondary transition-colors"
              >
                Playing as {profile === "srujan" ? "Srujan" : "Disha"} · Switch
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── LOADING ───────────────────────────────────── */}
      {effectivePhase === "loading" && (
        <div className="pt-10">
          <LoadingState lines={4} />
        </div>
      )}

      {/* ── ERROR ─────────────────────────────────────── */}
      {effectivePhase === "error" && (
        <div className="pt-10">
          <ErrorState
            message={errorMessage || "Something went wrong."}
            onRetry={handleRetry}
          />
        </div>
      )}

      {/* ── SELECT PROFILE ────────────────────────────── */}
      {effectivePhase === "select_profile" && (
        <section className="mt-10 space-y-4">
          <p className="type-body text-text-secondary">Who is earning?</p>
          <div className="grid grid-cols-2 gap-3">
            {(["srujan", "disha"] as const).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => handleSelectProfile(name)}
                className="rounded-lg border border-border bg-bg-secondary p-5 text-center transition-all duration-150 hover:border-accent hover:bg-accent-muted active:scale-[0.98] focus-visible:outline-none touch-manipulation"
              >
                <p className="type-title-sm text-text-primary">
                  {name === "srujan" ? "Srujan" : "Disha"}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── CHALLENGE ─────────────────────────────────── */}
      {effectivePhase === "challenge" && challenge && (
        <section className="mt-8 space-y-6">
          {/* Challenge metadata */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg select-none" aria-hidden="true">
              {CHALLENGE_TYPE_ICONS[challenge.challenge_type] || "🧩"}
            </span>
            <span className="text-[0.8125rem] font-medium text-text-secondary">
              {CHALLENGE_TYPE_LABELS[challenge.challenge_type] || challenge.challenge_type}
            </span>
            <span className="text-[0.6875rem] text-text-tertiary">·</span>
            <span
              className={cn(
                "text-[0.6875rem] font-medium px-2 py-0.5 rounded-full",
                challenge.difficulty === "easy" && "bg-positive/15 text-positive",
                challenge.difficulty === "medium" && "bg-accent-muted text-accent",
                challenge.difficulty === "hard" && "bg-destructive/15 text-destructive"
              )}
            >
              {DIFFICULTY_LABELS[challenge.difficulty] || challenge.difficulty}
            </span>
            <span className="ml-auto type-mono font-semibold text-positive text-[0.875rem]">
              +{formatPaise(challenge.reward_paise)}
            </span>
          </div>

          {/* Question */}
          <div className="rounded-lg border border-border bg-bg-secondary p-5">
            <p className="type-body text-text-primary leading-relaxed whitespace-pre-wrap">
              {challenge.prompt}
            </p>
          </div>

          {/* Answer Input */}
          {challenge.options ? (
            <div className="space-y-2.5">
              {challenge.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSelectedOption(option)}
                  className={cn(
                    "w-full text-left rounded-lg border p-3.5 transition-all duration-150 touch-manipulation",
                    selectedOption === option
                      ? "border-accent bg-accent-muted text-text-primary"
                      : "border-border bg-bg-secondary/50 text-text-secondary hover:border-border-active hover:text-text-primary"
                  )}
                >
                  <span className="type-body-sm">{option}</span>
                </button>
              ))}
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && answer.trim()) handleSubmit();
                }}
                placeholder="Type your answer…"
                className="w-full rounded-lg border border-border bg-bg-secondary/50 px-4 py-3 text-[0.9375rem] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 transition-colors"
                autoComplete="off"
                autoFocus
              />
            </div>
          )}

          {/* Submit button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              (challenge.options ? !selectedOption : !answer.trim())
            }
            className={cn(
              "w-full rounded-lg py-3.5 text-[0.9375rem] font-semibold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent min-h-[48px] touch-manipulation",
              isSubmitting ||
                (challenge.options ? !selectedOption : !answer.trim())
                ? "bg-bg-tertiary text-text-tertiary cursor-not-allowed"
                : "bg-accent text-white hover:bg-accent/90 active:bg-accent/80"
            )}
          >
            {isSubmitting ? "Checking…" : "Submit answer"}
          </button>
        </section>
      )}

      {/* ── RESULT ────────────────────────────────────── */}
      {effectivePhase === "result" && result && (
        <section className="mt-8 space-y-6">
          <div
            className={cn(
              "rounded-xl border p-6 text-center space-y-3",
              result.is_correct && result.milestone_reached && result.streak_bonus_paise > 0
                ? "border-accent/40 bg-accent/10"
                : result.is_correct
                ? "border-positive/30 bg-positive/5"
                : "border-border bg-bg-secondary"
            )}
          >
            {result.is_correct && result.milestone_reached && result.streak_bonus_paise > 0 ? (
              <div className="space-y-3">
                <p className="text-3xl select-none animate-pulse-subtle">🎉</p>
                <p className="type-title text-accent font-bold">
                  🎉 {result.current_streak}-day streak!
                </p>
                <div className="my-2 space-y-1.5 max-w-xs mx-auto rounded-lg border border-border/60 bg-bg-primary/60 p-3 text-xs">
                  <div className="flex justify-between text-text-secondary">
                    <span>Challenge reward</span>
                    <span className="font-medium text-positive">
                      +{formatPaise(result.reward_paise)}
                    </span>
                  </div>
                  <div className="flex justify-between text-accent font-medium">
                    <span>Streak bonus</span>
                    <span>+{formatPaise(result.streak_bonus_paise)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border/50 pt-1 font-bold text-text-primary">
                    <span>Total earned</span>
                    <span className="text-positive">
                      +{formatPaise(result.total_earned_paise)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="text-3xl select-none">
                  {result.is_correct ? "🎉" : "😭"}
                </p>
                <p className="type-title text-text-primary">
                  {result.is_correct ? "Correct!" : "Not quite"}
                </p>
                {result.is_correct && result.reward_paise > 0 && (
                  <p className="type-title-lg text-positive font-bold">
                    +{formatPaise(result.reward_paise)}
                  </p>
                )}
                {result.is_correct && result.reward_paise === 0 && (
                  <p className="type-body-sm text-text-secondary">
                    Correct answer, but the daily game limit was already reached.
                  </p>
                )}
                {!result.is_correct && (
                  <p className="type-body-sm text-text-secondary">
                    No money lost. Better luck next time.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Explanation */}
          {result.explanation && (
            <div className="rounded-lg border border-border/60 bg-bg-secondary/50 p-4">
              <span className="type-caption text-text-tertiary block mb-1">
                Explanation
              </span>
              <p className="type-body-sm text-text-secondary leading-relaxed">
                {result.explanation}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleNextChallenge}
              className="w-full rounded-lg bg-accent py-3.5 text-[0.9375rem] font-semibold text-white transition-colors duration-150 hover:bg-accent/90 active:bg-accent/80 min-h-[48px] touch-manipulation"
            >
              Try another challenge
            </button>
            <Link
              href="/"
              className="flex w-full items-center justify-center rounded-lg border border-border py-3 text-[0.875rem] text-text-secondary hover:text-text-primary hover:border-border-active transition-colors min-h-[44px] touch-manipulation"
            >
              Back to Dashboard
            </Link>
          </div>
        </section>
      )}

      {/* ── DAILY LIMIT REACHED ───────────────────────── */}
      {effectivePhase === "daily_limit" && (
        <section className="mt-8 space-y-6">
          <div className="rounded-xl border border-positive/30 bg-positive/5 p-8 text-center space-y-3">
            <p className="text-3xl select-none">🎉</p>
            <p className="type-title text-text-primary">
              You&apos;ve earned your lil Kharchaa for today.
            </p>
            <p className="type-title-lg text-positive font-bold">
              {formatPaise(status?.today_earned_paise || 5000)} / {formatPaise(5000)}
            </p>
            <p className="type-body-sm text-text-secondary max-w-sm mx-auto">
              That&apos;s all for today. Come back tomorrow for another challenge.
            </p>
          </div>

          {/* Show last result explanation if available */}
          {result?.explanation && (
            <div className="rounded-lg border border-border/60 bg-bg-secondary/50 p-4">
              <span className="type-caption text-text-tertiary block mb-1">
                Last answer
              </span>
              <p className="type-body-sm text-text-secondary leading-relaxed">
                {result.explanation}
              </p>
            </div>
          )}

          <Link
            href="/"
            className="flex w-full items-center justify-center rounded-lg border border-border py-3 text-[0.875rem] text-text-secondary hover:text-text-primary hover:border-border-active transition-colors min-h-[44px] touch-manipulation"
          >
            Back to Dashboard
          </Link>
        </section>
      )}

      {/* ── Recent Attempts ───────────────────────────── */}
      {status && status.recent_attempts.length > 0 && phase !== "loading" && (
        <section className="mt-10">
          <span className="type-caption text-text-tertiary uppercase tracking-wider block mb-3">
            Recent attempts
          </span>
          <div className="space-y-1.5">
            {status.recent_attempts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border border-border/50 bg-bg-secondary/30 px-3.5 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "text-[0.75rem] font-bold w-5 text-center",
                      a.is_correct ? "text-positive" : "text-destructive"
                    )}
                  >
                    {a.is_correct ? "✓" : "✕"}
                  </span>
                  <span className="text-[0.8125rem] text-text-secondary">
                    {CHALLENGE_TYPE_LABELS[a.challenge_type] || a.challenge_type}
                  </span>
                </div>
                <span
                  className={cn(
                    "type-mono text-[0.8125rem] font-medium",
                    a.reward_paise > 0 ? "text-positive" : "text-text-tertiary"
                  )}
                >
                  {a.reward_paise > 0 ? `+${formatPaise(a.reward_paise)}` : "₹0"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Streak Modal ──────────────────────────────── */}
      {status?.streak && profile && (
        <StreakModal
          isOpen={isStreakModalOpen}
          onClose={() => setIsStreakModalOpen(false)}
          streak={status.streak}
          userName={profile === "srujan" ? "Srujan" : "Disha"}
        />
      )}
    </div>
  );
}
