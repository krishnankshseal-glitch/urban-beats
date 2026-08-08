"use client";

const bars = [
  { h: 10, delay: "0s" },
  { h: 18, delay: "0.15s" },
  { h: 24, delay: "0.3s" },
  { h: 16, delay: "0.45s" },
  { h: 22, delay: "0.6s" },
];

export function PulseMark({ size = "md" }: { size?: "sm" | "md" }) {
  const height = size === "sm" ? 16 : 24;
  return (
    <span
      className="inline-flex items-end gap-[3px]"
      style={{ height }}
      aria-hidden="true"
    >
      {bars.map((bar, i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-gradient-to-t from-aura-blue to-aura-red motion-safe:animate-pulse-bar"
          style={{
            height: (bar.h / 24) * height,
            animationDelay: bar.delay,
          }}
        />
      ))}
    </span>
  );
}
