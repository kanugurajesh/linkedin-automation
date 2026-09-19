import React from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { brand } from "../config/brand";
import type { StatVideoProps } from "./types";

const { colors } = brand;

export const STAT_FPS = 30;
export const STAT_DURATION = 450; // 15s: stat (0-4s), bullets (4-11s), outro (11-15s)

/** "$4.2B" -> counts 0 -> 4.2 while keeping the prefix/suffix and decimal places. */
function useCountedValue(value: string, frame: number, durationFrames: number): string {
  const m = /^(\D*)([\d,]*\.?\d+)(.*)$/.exec(value.trim());
  if (!m) return value;
  const [, prefix, num, suffix] = m;
  const target = Number(num.replaceAll(",", ""));
  const decimals = num.includes(".") ? num.split(".")[1].length : 0;
  const t = interpolate(frame, [0, durationFrames], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const current = (target * t).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${prefix}${current}${suffix}`;
}

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ backgroundColor: colors.background, fontFamily: brand.font, color: colors.text, padding: 96 }}>{children}</AbsoluteFill>
);

const StatScene: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14 } });
  const counted = useCountedValue(value, frame, 60);
  const labelIn = interpolate(frame, [40, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Frame>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 36 }}>
        <div style={{ width: 96, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />
        <div style={{ fontSize: value.length > 7 ? 190 : 260, fontWeight: 800, letterSpacing: -6, lineHeight: 1, color: colors.accent, transform: `scale(${0.85 + 0.15 * pop})`, transformOrigin: "left center" }}>
          {counted}
        </div>
        <div style={{ fontSize: 56, fontWeight: 600, lineHeight: 1.25, opacity: labelIn, transform: `translateY(${(1 - labelIn) * 20}px)` }}>{label}</div>
      </div>
    </Frame>
  );
};

const BulletsScene: React.FC<{ bullets: string[] }> = ({ bullets }) => {
  const frame = useCurrentFrame();
  const step = Math.floor(210 / Math.max(1, bullets.length));
  return (
    <Frame>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 56 }}>
        {bullets.map((b, i) => {
          const p = interpolate(frame, [i * step, i * step + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={i} style={{ display: "flex", gap: 32, alignItems: "flex-start", opacity: p, transform: `translateX(${(1 - p) * 60}px)` }}>
              <div style={{ minWidth: 20, height: 20, marginTop: 24, borderRadius: 10, backgroundColor: colors.accent }} />
              <div style={{ fontSize: b.length > 60 ? 46 : 56, fontWeight: 600, lineHeight: 1.25, wordBreak: "break-word" }}>{b}</div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
};

const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  return (
    <Frame>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 28, opacity: p }}>
        <div style={{ fontSize: 84, fontWeight: 800 }}>{brand.name}</div>
        <div style={{ fontSize: 48, color: colors.accent, fontWeight: 700 }}>{brand.cta}</div>
        <div style={{ fontSize: 40, color: colors.muted }}>{brand.handle}</div>
      </div>
    </Frame>
  );
};

export const StatVideo: React.FC<StatVideoProps> = ({ value, label, bullets }) => (
  <AbsoluteFill>
    <Sequence from={0} durationInFrames={120}>
      <StatScene value={value} label={label} />
    </Sequence>
    <Sequence from={120} durationInFrames={210}>
      <BulletsScene bullets={bullets} />
    </Sequence>
    <Sequence from={330} durationInFrames={120}>
      <OutroScene />
    </Sequence>
  </AbsoluteFill>
);
