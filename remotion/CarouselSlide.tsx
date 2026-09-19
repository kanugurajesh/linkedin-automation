import React from "react";
import { AbsoluteFill } from "remotion";
import { brand } from "../config/brand";
import type { CarouselSlideProps } from "./types";

const { colors } = brand;

/** Shrink type as text gets longer so it never overflows the slide. */
function size(text: string, max: number, min: number, softLimit: number): number {
  return Math.max(min, Math.round(max - (Math.max(0, text.length - 20) / softLimit) * (max - min)));
}

export const CarouselSlide: React.FC<CarouselSlideProps> = ({ heading, body, index, total }) => {
  const isCover = index === 0;
  const isLast = index === total - 1 && total > 1;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.background, fontFamily: brand.font, color: colors.text, padding: 96 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: colors.muted }}>
        <span>{brand.name}</span>
        <span>
          {index + 1} / {total}
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 40 }}>
        <div style={{ width: 96, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />
        <div
          style={{
            fontSize: isCover ? size(heading, 104, 64, 90) : size(heading, 84, 54, 70),
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: -1.5,
            wordBreak: "break-word",
          }}
        >
          {heading}
        </div>
        {body ? (
          <div style={{ fontSize: size(body, 44, 34, 160), lineHeight: 1.35, color: colors.muted, wordBreak: "break-word" }}>{body}</div>
        ) : null}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 32 }}>
        {isLast ? (
          <>
            <span style={{ color: colors.accent, fontWeight: 700 }}>{brand.cta}</span>
            <span style={{ color: colors.muted }}>{brand.handle}</span>
          </>
        ) : (
          <>
            <div style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surface, marginRight: 40 }}>
              <div style={{ width: `${((index + 1) / total) * 100}%`, height: "100%", borderRadius: 3, backgroundColor: colors.accent }} />
            </div>
            <span style={{ color: colors.muted }}>{isCover ? "Swipe" : ""} →</span>
          </>
        )}
      </div>
    </AbsoluteFill>
  );
};
