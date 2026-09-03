"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CURRENCY } from "@/lib/constants";
import {
  fetchHouseholdSummary,
  updateDailyAllowance,
} from "@/lib/data/finance";
import { paiseToRupees, rupeesToPaise } from "@/lib/money";
import type { HouseholdSummary } from "@/types";

export default function SettingsPage() {
  const [summary, setSummary] = useState<HouseholdSummary | null>(null);

  // Editing allowance state
  const [isEditingAllowance, setIsEditingAllowance] = useState(false);
  const [newRateStr, setNewRateStr] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const sumRes = await fetchHouseholdSummary();
        if (!isMounted) return;
        if (sumRes.status === "success" && sumRes.data) {
          setSummary(sumRes.data);
          setNewRateStr(paiseToRupees(sumRes.data.daily_rate_paise).toString());
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

  const handleSaveAllowance = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateRupees = parseFloat(newRateStr);
    if (!rateRupees || rateRupees <= 0) {
      setSaveError("Please enter an allowance greater than ₹0");
      return;
    }
    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await updateDailyAllowance({
        dailyRatePaise: rupeesToPaise(rateRupees),
        effectiveFrom: effectiveDate,
      });

      if (res.status === "error") {
        setSaveError(res.error || "Failed to update allowance");
        setIsSaving(false);
        return;
      }

      // Update local state
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              daily_rate_paise: rupeesToPaise(rateRupees),
            }
          : null
      );
      setIsEditingAllowance(false);
      setIsSaving(false);
    } catch {
      setSaveError("Failed to update allowance. Please try again.");
      setIsSaving(false);
    }
  };

  const currentDailyRupees = summary
    ? paiseToRupees(summary.daily_rate_paise)
    : 50;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 md:px-6 pt-8 md:pt-12 pb-16">
      <PageHeader title="Settings" />

      <div className="mt-10 space-y-8">
        {/* Daily allowance */}
        <div className="border-b border-border pb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="type-body text-text-primary font-medium">
                Daily allowance
              </p>
              <p className="type-body-sm text-text-tertiary mt-0.5">
                Per person, per day
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="type-title-sm text-text-primary">
                {CURRENCY.symbol}{currentDailyRupees}
              </span>
              {!isEditingAllowance && (
                <button
                  type="button"
                  onClick={() => {
                    setNewRateStr(currentDailyRupees.toString());
                    setIsEditingAllowance(true);
                  }}
                  className="type-caption text-accent hover:underline focus-visible:outline-none"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {/* Inline Edit Form */}
          {isEditingAllowance && (
            <form onSubmit={handleSaveAllowance} className="mt-5 rounded-lg border border-border bg-bg-secondary p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="type-caption text-text-tertiary mb-1 block">
                    New rate (₹ / person / day)
                  </label>
                  <Input
                    type="number"
                    prefix="₹"
                    min="1"
                    inputMode="decimal"
                    disabled={isSaving}
                    value={newRateStr}
                    onChange={(e) => {
                      setNewRateStr(e.target.value);
                      setSaveError(null);
                    }}
                    required
                  />
                </div>
                <div>
                  <label className="type-caption text-text-tertiary mb-1 block">
                    Effective date
                  </label>
                  <Input
                    type="date"
                    disabled={isSaving}
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <p className="text-[0.75rem] text-text-tertiary leading-relaxed">
                The new rate applies from the selected date forward. Historical allowance records will never be recalculated.
              </p>

              {saveError && (
                <p className="type-caption text-destructive">{saveError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving…" : "Save change"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => setIsEditingAllowance(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* People */}
        <div className="flex items-center justify-between border-b border-border pb-6">
          <div>
            <p className="type-body text-text-primary font-medium">People</p>
            <p className="type-body-sm text-text-tertiary mt-0.5">
              Who’s tracking
            </p>
          </div>
          <span className="type-body text-text-secondary">
            Srujan &amp; Disha
          </span>
        </div>
      </div>
    </div>
  );
}
