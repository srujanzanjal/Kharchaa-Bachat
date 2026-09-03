import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, className, children }: PageHeaderProps) {
  return (
    <header className={cn("flex items-end justify-between gap-4", className)}>
      <div>
        <h1 className="type-title text-text-primary">{title}</h1>
        {subtitle && (
          <p className="mt-1 type-body-sm text-text-secondary">{subtitle}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}
