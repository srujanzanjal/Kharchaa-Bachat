"use client";

import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

function Tabs({ tabs, activeId, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn("flex gap-6 border-b border-border", className)}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            id={`tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative pb-3 text-[0.875rem] font-medium",
              "transition-colors duration-150",
              "min-h-[44px] touch-manipulation",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              active ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            {tab.label}
            {active && (
              <span
                className="absolute bottom-0 left-0 right-0 h-px bg-accent"
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export { Tabs, type TabsProps, type Tab };
