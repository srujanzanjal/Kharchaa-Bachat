"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  fetchDatabaseStatus,
  fetchDiagnostics,
  fetchLedgerStats,
  fetchSystemInfo,
  runFinancialVerificationTests,
  type DatabaseStatusData,
  type DiagnosticsData,
  type LedgerStatsData,
  type SystemInfoData,
  type VerificationTestResult,
} from "@/lib/data/developer";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export default function DeveloperPage() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [dbStatus, setDbStatus] = useState<DatabaseStatusData | null>(null);
  const [ledgerStats, setLedgerStats] = useState<LedgerStatsData | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
  const [testResults, setTestResults] = useState<VerificationTestResult[] | null>(null);

  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshingDiag, startRefreshDiag] = useTransition();
  const [isRunningTests, startRunTests] = useTransition();

  useEffect(() => {
    let isMounted = true;

    async function loadAllData() {
      try {
        const [diagRes, dbRes, statsRes, sysRes] = await Promise.all([
          fetchDiagnostics(),
          fetchDatabaseStatus(),
          fetchLedgerStats(),
          fetchSystemInfo(),
        ]);

        if (!isMounted) return;

        if (diagRes.status === "success" && diagRes.data) {
          setDiagnostics(diagRes.data);
        }
        if (dbRes.status === "success" && dbRes.data) {
          setDbStatus(dbRes.data);
        }
        if (statsRes.status === "success" && statsRes.data) {
          setLedgerStats(statsRes.data);
        }
        if (sysRes.status === "success" && sysRes.data) {
          setSystemInfo(sysRes.data);
        }

        setIsLoadingInitial(false);
      } catch {
        if (isMounted) {
          setErrorMessage("Failed to load diagnostic data.");
          setIsLoadingInitial(false);
        }
      }
    }

    void loadAllData();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefreshDiagnostics = () => {
    startRefreshDiag(async () => {
      try {
        const [diagRes, dbRes] = await Promise.all([
          fetchDiagnostics(),
          fetchDatabaseStatus(),
        ]);
        if (diagRes.status === "success" && diagRes.data) setDiagnostics(diagRes.data);
        if (dbRes.status === "success" && dbRes.data) setDbStatus(dbRes.data);
      } catch {
        // Ignore
      }
    });
  };

  const handleRunTests = () => {
    startRunTests(async () => {
      try {
        const res = await runFinancialVerificationTests();
        if (res.status === "success" && res.data) {
          setTestResults(res.data);
        }
      } catch {
        // Ignore
      }
    });
  };

  if (isLoadingInitial) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 md:px-6 pt-10 pb-20">
        <PageHeader title="⚙ Developer Mode" subtitle="Loading system diagnostics…" />
        <div className="pt-8">
          <LoadingState lines={5} />
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 md:px-6 pt-10 pb-20">
        <ErrorState message={errorMessage} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 md:px-6 pt-8 md:pt-12 pb-24 space-y-10">
      {/* ── Top Header Bar ────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between gap-4 mb-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-[0.8125rem] text-text-tertiary hover:text-text-primary transition-colors focus-visible:outline-none"
          >
            ← Back to App
          </Link>
          <span className="inline-flex items-center rounded-full bg-positive/10 px-2.5 py-0.5 text-[0.6875rem] font-semibold tracking-wider text-positive uppercase">
            Read-Only Diagnostics
          </span>
        </div>
        <PageHeader
          title="⚙ Developer Mode"
          subtitle="Internal technical diagnostics, ledger telemetry, and invariant verifications."
        />
      </div>

      {/* ── 1. Subsystem Diagnostics ──────────────────── */}
      <section className="space-y-4" aria-label="Subsystem Diagnostics">
        <div className="flex items-center justify-between">
          <h2 className="type-title-sm text-text-primary flex items-center gap-2">
            <span>⚙</span>
            <span>Subsystem Diagnostics</span>
          </h2>
          <button
            type="button"
            onClick={handleRefreshDiagnostics}
            disabled={isRefreshingDiag}
            className="text-[0.75rem] font-medium text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-50"
          >
            {isRefreshingDiag ? "Checking…" : "Run diagnostics ↻"}
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {diagnostics?.subsystems.map((sub) => (
            <div
              key={sub.name}
              className="rounded-lg border border-border bg-bg-secondary/70 p-4 flex flex-col justify-between space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="type-body-sm font-semibold text-text-primary">
                  {sub.name}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium shrink-0",
                    sub.status === "healthy" && "bg-positive/15 text-positive",
                    sub.status === "degraded" && "bg-accent-muted text-accent",
                    sub.status === "error" && "bg-destructive/15 text-destructive"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      sub.status === "healthy" && "bg-positive",
                      sub.status === "degraded" && "bg-accent",
                      sub.status === "error" && "bg-destructive"
                    )}
                  />
                  {sub.status.toUpperCase()}
                </span>
              </div>
              <p className="text-[0.75rem] text-text-secondary leading-relaxed">
                {sub.message}
              </p>
              <span className="text-[0.6875rem] text-text-tertiary type-mono">
                {sub.latencyMs} ms
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 2. Database Status ────────────────────────── */}
      {dbStatus && (
        <section className="space-y-4" aria-label="Database Status">
          <h2 className="type-title-sm text-text-primary flex items-center gap-2">
            <span>🗄</span>
            <span>Database Status</span>
          </h2>
          <div className="rounded-lg border border-border bg-bg-secondary/70 p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <span className="type-caption text-text-tertiary block">Connection</span>
                <span className="type-body-sm font-semibold text-positive flex items-center gap-1.5 mt-0.5">
                  <span className="h-2 w-2 rounded-full bg-positive" />
                  Connected
                </span>
              </div>
              <div>
                <span className="type-caption text-text-tertiary block">Roundtrip Latency</span>
                <span className="type-mono font-semibold text-text-primary text-[0.875rem] mt-0.5 block">
                  {dbStatus.latencyMs} ms
                </span>
              </div>
              <div>
                <span className="type-caption text-text-tertiary block">Public Tables</span>
                <span className="type-mono font-semibold text-text-primary text-[0.875rem] mt-0.5 block">
                  {dbStatus.tableCount}
                </span>
              </div>
            </div>

            <div className="border-t border-border/60 pt-3 text-[0.75rem] space-y-1.5 text-text-tertiary">
              <p>Engine: <span className="text-text-secondary">{dbStatus.engine}</span></p>
              <p>Pool: <span className="text-text-secondary">{dbStatus.poolStatus}</span></p>
              <p>Server Time (IST): <span className="type-mono text-text-secondary">{dbStatus.serverTimeIst}</span></p>
            </div>
          </div>
        </section>
      )}

      {/* ── 3. Ledger Statistics ──────────────────────── */}
      {ledgerStats && (
        <section className="space-y-4" aria-label="Ledger Statistics">
          <h2 className="type-title-sm text-text-primary flex items-center gap-2">
            <span>📊</span>
            <span>Ledger Statistics</span>
          </h2>
          <div className="rounded-lg border border-border bg-bg-secondary/70 p-5 space-y-5">
            {/* Balances */}
            <div>
              <span className="type-caption text-text-tertiary uppercase tracking-wider block mb-2">
                Live Reconstructed Balances
              </span>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border border-border/50 bg-bg-primary/50 p-3 text-center">
                  <span className="text-[0.6875rem] text-text-tertiary block">Srujan</span>
                  <span className="type-mono font-bold text-text-primary text-[0.9375rem] mt-1 block">
                    {formatPaise(ledgerStats.currentBalances.srujanPaise)}
                  </span>
                </div>
                <div className="rounded-md border border-border/50 bg-bg-primary/50 p-3 text-center">
                  <span className="text-[0.6875rem] text-text-tertiary block">Disha</span>
                  <span className="type-mono font-bold text-text-primary text-[0.9375rem] mt-1 block">
                    {formatPaise(ledgerStats.currentBalances.dishaPaise)}
                  </span>
                </div>
                <div className="rounded-md border border-border/50 bg-bg-primary/50 p-3 text-center">
                  <span className="text-[0.6875rem] text-text-tertiary block">Combined</span>
                  <span className="type-mono font-bold text-accent text-[0.9375rem] mt-1 block">
                    {formatPaise(ledgerStats.currentBalances.combinedPaise)}
                  </span>
                </div>
              </div>
            </div>

            {/* Entry breakdown */}
            <div className="border-t border-border/60 pt-4">
              <span className="type-caption text-text-tertiary uppercase tracking-wider block mb-2">
                Ledger Entries ({ledgerStats.totalLedgerEntries} total)
              </span>
              <div className="space-y-2 text-[0.8125rem]">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Allowance Credits</span>
                  <span className="type-mono text-text-primary">
                    {ledgerStats.allowanceCredits.count} entries · {formatPaise(ledgerStats.allowanceCredits.sumPaise)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Expense Debits</span>
                  <span className="type-mono text-text-primary">
                    {ledgerStats.expenseDebits.count} entries · {formatPaise(ledgerStats.expenseDebits.sumPaise)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Earn Challenge Credits</span>
                  <span className="type-mono text-text-primary">
                    {ledgerStats.earnCredits.count} entries · {formatPaise(ledgerStats.earnCredits.sumPaise)}
                  </span>
                </div>
                {ledgerStats.manualCredits.count > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Manual Credits</span>
                    <span className="type-mono text-text-primary">
                      {ledgerStats.manualCredits.count} entries · {formatPaise(ledgerStats.manualCredits.sumPaise)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Expenses & Earn Activity */}
            <div className="border-t border-border/60 pt-4 grid grid-cols-2 gap-4 text-[0.75rem]">
              <div>
                <span className="type-caption text-text-tertiary block">Expenses Logged</span>
                <span className="type-mono font-semibold text-text-primary text-[0.875rem] mt-0.5 block">
                  {ledgerStats.totalExpenses.count} ({formatPaise(ledgerStats.totalExpenses.sumPaise)})
                </span>
              </div>
              <div>
                <span className="type-caption text-text-tertiary block">Earn Rewards Paid</span>
                <span className="type-mono font-semibold text-text-primary text-[0.875rem] mt-0.5 block">
                  {ledgerStats.earnSummary.correctAttempts} solved · {formatPaise(ledgerStats.earnSummary.totalRewardPaise)}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── 4. Financial Test Utilities ───────────────── */}
      <section className="space-y-4" aria-label="Financial Test Utilities">
        <div className="flex items-center justify-between">
          <h2 className="type-title-sm text-text-primary flex items-center gap-2">
            <span>🧪</span>
            <span>Financial Test Utilities</span>
          </h2>
          <button
            type="button"
            onClick={handleRunTests}
            disabled={isRunningTests}
            className="rounded-lg bg-bg-tertiary px-3 py-1.5 text-[0.75rem] font-semibold text-text-primary hover:bg-bg-secondary hover:text-white transition-colors disabled:opacity-50 focus-visible:outline-none"
          >
            {isRunningTests ? "Verifying Invariants…" : "Run Invariant Suite 🧪"}
          </button>
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary/70 p-5 space-y-3">
          <p className="text-[0.8125rem] text-text-secondary leading-relaxed">
            Runs non-mutating, read-only integrity checks directly against the database to confirm that balances, constraints, and audit invariants are 100% intact.
          </p>

          {testResults ? (
            <div className="space-y-2 pt-2">
              {testResults.map((t) => (
                <div
                  key={t.id}
                  className="rounded-md border border-border/60 bg-bg-primary/60 p-3 flex items-start justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="type-body-sm font-semibold text-text-primary">
                        {t.name}
                      </span>
                      <span className="text-[0.6875rem] text-text-tertiary type-mono">
                        ({t.durationMs}ms)
                      </span>
                    </div>
                    <p className="text-[0.75rem] text-text-secondary leading-relaxed">
                      {t.description}
                    </p>
                    <p className="text-[0.6875rem] text-text-tertiary font-mono">
                      {t.details}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[0.6875rem] font-bold shrink-0",
                      t.status === "pass"
                        ? "bg-positive/15 text-positive"
                        : "bg-destructive/15 text-destructive"
                    )}
                  >
                    {t.status === "pass" ? "PASS" : "FAIL"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-border/40 bg-bg-primary/30 p-4 text-center">
              <span className="text-[0.8125rem] text-text-tertiary">
                Click &quot;Run Invariant Suite 🧪&quot; above to execute live read-only verification.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ── 5. System Information ─────────────────────── */}
      {systemInfo && (
        <section className="space-y-4" aria-label="System Information">
          <h2 className="type-title-sm text-text-primary flex items-center gap-2">
            <span>💻</span>
            <span>System Information</span>
          </h2>
          <div className="rounded-lg border border-border bg-bg-secondary/70 p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-4 text-[0.8125rem]">
              <div>
                <span className="type-caption text-text-tertiary block">App Version</span>
                <span className="type-mono text-text-primary font-medium">{systemInfo.appVersion}</span>
              </div>
              <div>
                <span className="type-caption text-text-tertiary block">Environment</span>
                <span className="type-mono text-text-primary font-medium">{systemInfo.environment}</span>
              </div>
              <div>
                <span className="type-caption text-text-tertiary block">Framework</span>
                <span className="type-mono text-text-primary font-medium">{systemInfo.framework}</span>
              </div>
              <div>
                <span className="type-caption text-text-tertiary block">Runtime</span>
                <span className="type-mono text-text-primary font-medium">{systemInfo.nodeVersion}</span>
              </div>
              <div className="col-span-2">
                <span className="type-caption text-text-tertiary block">Server Time (IST)</span>
                <span className="type-mono text-text-primary font-medium">{systemInfo.serverTimeIst}</span>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
