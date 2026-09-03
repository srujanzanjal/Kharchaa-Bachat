"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Selector } from "@/components/ui/selector";
import {
  checkExpenseCoverage,
  fetchHouseholdSummary,
  recordExpenseAtomic,
} from "@/lib/data/finance";
import { formatPaise, paiseToRupees, rupeesToPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CoverageCheckResult, ExpenseCategory, ExpenseOwner, HouseholdSummary } from "@/types";

const OWNER_OPTIONS = [
  { value: "srujan" as const, label: "Srujan" },
  { value: "disha" as const, label: "Disha" },
  { value: "both" as const, label: "Both" },
];

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: "food", label: "Food" },
  { value: "coffee_tea", label: "Coffee & Tea" },
  { value: "groceries", label: "Groceries" },
  { value: "sweets", label: "Sweets" },
  { value: "drinks", label: "Drinks" },
  { value: "other", label: "Other" },
];

export default function AddExpensePage() {
  const router = useRouter();

  // Form states
  const [amountStr, setAmountStr] = useState("");
  const [owner, setOwner] = useState<ExpenseOwner>("both");
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [note, setNote] = useState("");

  // Custom split state for "Both"
  const [isCustomSplit, setIsCustomSplit] = useState(false);
  const [customSrujanStr, setCustomSrujanStr] = useState("");
  const [customDishaStr, setCustomDishaStr] = useState("");

  // Household data
  const [summary, setSummary] = useState<HouseholdSummary | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Shortfall approval state
  const [coverageCheck, setCoverageCheck] = useState<CoverageCheckResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const sumRes = await fetchHouseholdSummary();
        if (!isMounted) return;
        if (sumRes.status === "success" && sumRes.data) {
          setSummary(sumRes.data);
        }
      } catch {
        // Fallback
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const totalRupees = parseFloat(amountStr) || 0;
  const totalPaise = rupeesToPaise(totalRupees);

  // Auto calculate 50/50 splits for display
  const defaultSrujanPaise = Math.floor(totalPaise / 2);
  const defaultDishaPaise = totalPaise - defaultSrujanPaise;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Guard against rapid duplicate clicks
    if (isSubmitting) return;
    setFormError(null);

    // Validate numeric amount
    if (!Number.isFinite(totalRupees) || totalRupees <= 0) {
      setFormError("Please enter a valid amount greater than ₹0");
      return;
    }

    // Validate mandatory category
    if (!category) {
      setFormError("Please select a category for this expense.");
      return;
    }

    if (!summary?.household_id) {
      setFormError("We can’t reach your data right now.");
      return;
    }

    let srujanSplitPaise: number | undefined = undefined;
    let dishaSplitPaise: number | undefined = undefined;

    if (owner === "both" && isCustomSplit) {
      const sRupees = parseFloat(customSrujanStr) || 0;
      const dRupees = parseFloat(customDishaStr) || 0;
      srujanSplitPaise = rupeesToPaise(sRupees);
      dishaSplitPaise = rupeesToPaise(dRupees);

      if (srujanSplitPaise + dishaSplitPaise !== totalPaise) {
        setFormError(
          `Contributions (₹${sRupees} + ₹${dRupees}) must equal total amount (₹${totalRupees})`
        );
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // 1. Run server coverage & shortfall check
      const checkRes = await checkExpenseCoverage({
        totalAmountPaise: totalPaise,
        owner,
        srujanSplitPaise,
        dishaSplitPaise,
      });

      if (checkRes.status === "error" || !checkRes.data) {
        setFormError(checkRes.error || "We can’t reach your data right now.");
        setIsSubmitting(false);
        return;
      }

      const check = checkRes.data;

      // 2. Collective insufficiency
      if (!check.allowed && check.status === "insufficient_combined_balance") {
        setFormError(
          `Cannot spend ₹${totalRupees}. Combined available balance is ₹${paiseToRupees(
            summary.combined_paise
          )}.`
        );
        setIsSubmitting(false);
        return;
      }

      // 3. Individual user insufficiency
      if (!check.allowed && check.status === "insufficient_individual_balance") {
        const whoShort = check.short_user || (owner === "srujan" ? "Srujan" : "Disha");
        setFormError(
          `${whoShort} does not have enough balance for this expense.`
        );
        setIsSubmitting(false);
        return;
      }

      // 4. Partner cannot cover shortfall
      if (!check.allowed && check.status === "cannot_cover") {
        setFormError(
          "Insufficient combined funds to cover partner's shortfall."
        );
        setIsSubmitting(false);
        return;
      }

      // 5. Shortfall requires approval
      if (check.needs_coverage) {
        setCoverageCheck(check);
        setIsSubmitting(false);
        return;
      }

      // 6. Normal expense (sufficient balance, no coverage needed)
      await commitExpense(
        check.srujan_paise ?? (owner === "srujan" ? totalPaise : 0),
        check.disha_paise ?? (owner === "disha" ? totalPaise : 0),
        false,
        undefined,
        undefined,
        category
      );
    } catch {
      setFormError("We can’t reach your data right now.");
      setIsSubmitting(false);
    }
  };

  const commitExpense = async (
    srujanAmountPaise: number,
    dishaAmountPaise: number,
    coverageApproved: boolean,
    coverageFromName?: string,
    coverageAmountPaise?: number,
    chosenCategory?: ExpenseCategory
  ) => {
    const finalCategory = chosenCategory || category;
    if (!finalCategory) {
      setFormError("Please select a category for this expense.");
      return;
    }

    setIsSubmitting(true);
    const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined;

    const recordRes = await recordExpenseAtomic({
      totalAmountPaise: totalPaise,
      owner,
      category: finalCategory,
      srujanAmountPaise,
      dishaAmountPaise,
      note: note.trim() || undefined,
      coverageApproved,
      coverageFromName,
      coverageAmountPaise,
      idempotencyKey,
    });

    if (recordRes.status === "error" || !recordRes.data) {
      setFormError(recordRes.error || "Failed to save expense.");
      setIsSubmitting(false);
      setCoverageCheck(null);
      return;
    }

    setSuccessMessage(`Logged ₹${totalRupees} successfully`);
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 600);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-5 md:px-6 pt-8 md:pt-12 pb-16">
      <PageHeader title="Add expense" subtitle="Quickly log what you spent" />

      {successMessage ? (
        <div className="mt-16 text-center py-12">
          <p className="type-title text-text-primary">{successMessage}</p>
          <p className="type-body-sm text-text-secondary mt-1">Updating balances…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-7">
          {/* 1. Amount */}
          <div>
            <label className="type-caption text-text-secondary mb-2 block">
              Amount
            </label>
            <Input
              type="number"
              prefix="₹"
              placeholder="0"
              min="0.01"
              step="any"
              disabled={isSubmitting}
              value={amountStr}
              onChange={(e) => {
                setAmountStr(e.target.value);
                setFormError(null);
                setCoverageCheck(null);
              }}
              className="text-2xl font-semibold h-14"
              required
              autoFocus
            />
          </div>

          {/* 2. Who is this for? */}
          <div>
            <label className="type-caption text-text-secondary mb-2 block">
              Who is this for?
            </label>
            <Selector
              options={OWNER_OPTIONS}
              value={owner}
              onChange={(val) => {
                setOwner(val);
                setFormError(null);
                setCoverageCheck(null);
              }}
            />
          </div>

          {/* 3. Category (Mandatory) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="type-caption text-text-secondary block">
                Category <span className="text-accent">*</span>
              </label>
              {category && (
                <span className="type-caption text-accent font-medium">
                  {CATEGORY_OPTIONS.find((c) => c.value === category)?.label}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {CATEGORY_OPTIONS.map((cat) => {
                const isSelected = category === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setCategory(cat.value);
                      setFormError(null);
                      setCoverageCheck(null);
                    }}
                    className={cn(
                      "rounded-md py-2.5 px-2 text-[0.8125rem] font-medium border text-center transition-all duration-150 min-h-[42px] select-none touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                      isSelected
                        ? "border-accent bg-accent/15 text-text-primary shadow-sm"
                        : "border-border bg-bg-secondary text-text-secondary hover:text-text-primary hover:border-border-active"
                    )}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Shared Split options when "Both" is selected */}
          {owner === "both" && totalPaise > 0 && (
            <div className="rounded-lg border border-border bg-bg-secondary p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="type-body-sm text-text-secondary">
                  {!isCustomSplit
                    ? `Default 50/50 split (${formatPaise(defaultSrujanPaise)} each)`
                    : "Custom split"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomSplit(!isCustomSplit);
                    setCustomSrujanStr(paiseToRupees(defaultSrujanPaise).toString());
                    setCustomDishaStr(paiseToRupees(defaultDishaPaise).toString());
                  }}
                  className="type-caption text-accent hover:underline focus-visible:outline-none"
                >
                  {isCustomSplit ? "Use 50/50" : "Customize"}
                </button>
              </div>

              {isCustomSplit && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="type-caption text-text-tertiary mb-1 block">
                      Srujan share
                    </label>
                    <Input
                      type="number"
                      prefix="₹"
                      disabled={isSubmitting}
                      value={customSrujanStr}
                      onChange={(e) => setCustomSrujanStr(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="type-caption text-text-tertiary mb-1 block">
                      Disha share
                    </label>
                    <Input
                      type="number"
                      prefix="₹"
                      disabled={isSubmitting}
                      value={customDishaStr}
                      onChange={(e) => setCustomDishaStr(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. Note */}
          <div>
            <label className="type-caption text-text-secondary mb-2 block">
              Note (optional)
            </label>
            <Input
              type="text"
              placeholder="e.g. Chai & samosa, Coffee, Groceries"
              disabled={isSubmitting}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* 6. Pre-submission Contribution Preview */}
          {totalPaise > 0 && (
            <div className="rounded-md bg-bg-secondary/50 px-3.5 py-2.5 border border-border/40 text-[0.8125rem] text-text-secondary flex items-center justify-between">
              <span>Contribution preview:</span>
              <span className="text-text-primary font-medium">
                {owner === "srujan" && `Srujan pays ₹${totalRupees}`}
                {owner === "disha" && `Disha pays ₹${totalRupees}`}
                {owner === "both" && !isCustomSplit && `Srujan ${formatPaise(defaultSrujanPaise)} · Disha ${formatPaise(defaultDishaPaise)}`}
                {owner === "both" && isCustomSplit && `Srujan ₹${parseFloat(customSrujanStr) || 0} · Disha ₹${parseFloat(customDishaStr) || 0}`}
              </span>
            </div>
          )}

          {/* Form Error Banner */}
          {formError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-center">
              <p className="type-body-sm text-destructive">{formError}</p>
            </div>
          )}

          {/* Shortfall Approval Surface */}
          {coverageCheck && coverageCheck.needs_coverage && (
            <div className="rounded-lg border border-accent/40 bg-accent/10 p-5 space-y-4">
              <div>
                <p className="type-title-sm text-text-primary">
                  {coverageCheck.short_user} doesn’t have enough for their share
                </p>
                <p className="mt-1 type-body-sm text-text-secondary">
                  {formatPaise(coverageCheck.shortfall_paise ?? 0)} needs to be covered by{" "}
                  {coverageCheck.covering_user}.
                </p>
              </div>

              <div className="py-2 text-[0.8125rem] text-text-secondary space-y-1">
                <p>
                  • Srujan pays:{" "}
                  <span className="text-text-primary font-medium">
                    {formatPaise(coverageCheck.adjusted_srujan_paise ?? 0)}
                  </span>
                </p>
                <p>
                  • Disha pays:{" "}
                  <span className="text-text-primary font-medium">
                    {formatPaise(coverageCheck.adjusted_disha_paise ?? 0)}
                  </span>
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="primary"
                  disabled={isSubmitting}
                  onClick={() =>
                    commitExpense(
                      coverageCheck.adjusted_srujan_paise ?? 0,
                      coverageCheck.adjusted_disha_paise ?? 0,
                      true,
                      coverageCheck.covering_user?.toLowerCase(),
                      coverageCheck.shortfall_paise ?? 0,
                      category || undefined
                    )
                  }
                  className="flex-1"
                >
                  {isSubmitting ? "Saving…" : "Approve coverage"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSubmitting}
                  onClick={() => setCoverageCheck(null)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Main Action Button */}
          {!coverageCheck && (
            <Button
              type="submit"
              disabled={isSubmitting || totalRupees <= 0}
              size="lg"
              className="w-full"
            >
              {isSubmitting ? "Checking balance…" : "Add expense"}
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
