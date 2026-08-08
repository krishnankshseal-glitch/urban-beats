import clsx from "clsx";

const VARIANTS = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  dueSoon: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  overdue: "bg-aura-red/10 text-aura-redSoft border-aura-red/20",
  neutral: "bg-white/5 text-slate-400 border-white/10",
  info: "bg-aura-blue/10 text-aura-blueSoft border-aura-blue/20",
};

export function Badge({
  children,
  variant = "neutral",
}: {
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        VARIANTS[variant]
      )}
    >
      {children}
    </span>
  );
}

export function membershipBadgeVariant(status: string): keyof typeof VARIANTS {
  if (status === "ACTIVE") return "active";
  if (status === "DUE_SOON") return "dueSoon";
  if (status === "OVERDUE") return "overdue";
  return "neutral";
}

export function membershipBadgeLabel(status: string): string {
  if (status === "ACTIVE") return "Active";
  if (status === "DUE_SOON") return "Due soon";
  if (status === "OVERDUE") return "Overdue";
  return "Not set";
}
