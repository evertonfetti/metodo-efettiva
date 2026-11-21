import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-navy text-white hover:bg-navy-700",
        secondary: "border border-border-strong bg-surface text-navy hover:bg-surface-muted",
        ghost: "text-navy hover:bg-surface-sunken",
        danger: "border border-border-strong bg-surface text-err hover:bg-err-bg",
        success: "bg-ok text-white hover:opacity-90",
        link: "h-auto px-0 text-navy underline-offset-4 hover:underline",
      },
      size: {
        md: "min-h-10 px-4",
        sm: "min-h-8 px-3 text-[13px]",
        lg: "min-h-11 px-5",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
