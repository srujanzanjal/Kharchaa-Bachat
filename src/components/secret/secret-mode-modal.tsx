"use client";

import { useEffect, useState } from "react";
import { getSecretMessage, SECRET_MESSAGES } from "@/lib/secret-messages";
import { cn } from "@/lib/utils";

interface SecretModeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SecretModeModal({ isOpen, onClose }: SecretModeModalProps) {
  const [offset, setOffset] = useState(0);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOffset(0);
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleClose = () => {
    setOffset(0);
    onClose();
  };

  if (!isOpen) return null;

  const currentMessage = getSecretMessage(offset);

  const handleNextMessage = () => {
    setOffset((prev) => (prev + 1) % SECRET_MESSAGES.length);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Secret Mode"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* ── Backdrop ─────────────────────────────────── */}
      <div
        onClick={handleClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity duration-300 animate-fade-in"
      />

      {/* ── Modal Card ───────────────────────────────── */}
      <div
        className={cn(
          "relative z-10 w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-border/80 bg-bg-secondary/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl",
          "animate-slide-up"
        )}
      >
        {/* Subtle decorative glow */}
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-accent/15 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-accent/10 blur-3xl"
          aria-hidden="true"
        />

        {/* Header */}
        <div className="flex items-center justify-between pb-6">
          <div className="flex items-center gap-2">
            <span className="text-sm select-none" aria-hidden="true">
              💕
            </span>
            <span className="type-caption font-semibold tracking-wider text-accent">
              Secret Mode
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent -mr-2"
            aria-label="Close secret mode"
          >
            <span className="text-base leading-none">✕</span>
          </button>
        </div>

        {/* Message Container */}
        <div className="relative my-4 min-h-[140px] rounded-xl border border-border/60 bg-bg-primary/60 p-6 flex items-center justify-center text-center">
          <p className="type-body text-text-primary leading-relaxed whitespace-pre-line font-medium transition-all duration-200">
            {currentMessage}
          </p>
        </div>

        {/* Card Footer Actions */}
        <div className="mt-6 flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={handleNextMessage}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-tertiary/60 px-3.5 py-2 text-[0.8125rem] font-medium text-text-secondary transition-colors hover:border-border-active hover:text-text-primary active:scale-[0.98] focus-visible:outline-none"
          >
            <span>Another note</span>
            <span aria-hidden="true">💌</span>
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg bg-accent px-4 py-2 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-accent/90 active:bg-accent/80 focus-visible:outline-none"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
