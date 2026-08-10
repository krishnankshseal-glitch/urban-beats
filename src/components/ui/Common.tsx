"use client";

import clsx from "clsx";
import { motion } from "framer-motion";

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "text-white",
    secondary: "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
    danger: "border border-aura-red/20 bg-aura-red/10 text-aura-redSoft hover:bg-aura-red/20",
    ghost: "text-slate-400 hover:bg-white/5 hover:text-slate-200",
  };
  const style =
    variant === "primary" ? { background: "linear-gradient(90deg, #3b6bff, #ff3b5c)" } : undefined;

  return (
    <button className={clsx(base, variants[variant], className)} style={style} {...props} />
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold text-white">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="glass-card flex flex-col items-center gap-1 px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
    </div>
  );
}

export function InlineAlert({ kind = "error", children }: { kind?: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className={clsx(
        "rounded-lg px-3 py-2 text-sm",
        kind === "error" ? "bg-aura-red/10 text-aura-redSoft" : "bg-emerald-500/10 text-emerald-400"
      )}
    >
      {children}
    </p>
  );
}

export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
