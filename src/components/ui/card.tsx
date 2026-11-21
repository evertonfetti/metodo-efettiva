import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-[12px] border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({ title, action, className, id }: { title: React.ReactNode; action?: React.ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-border px-5 py-4", className)}>
      <h2 id={id} className="text-[17px] font-extrabold text-navy">
        {title}
      </h2>
      {action}
    </div>
  );
}
