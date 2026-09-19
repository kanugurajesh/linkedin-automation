import React from "react";
import { AbsoluteFill } from "remotion";
import { brand } from "../config/brand";
import type { QuoteCardProps } from "./types";

const { colors } = brand;

export const QuoteCard: React.FC<QuoteCardProps> = ({ quote, attribution }) => {
  const fontSize = Math.max(50, Math.round(88 - (Math.max(0, quote.length - 40) / 200) * 38));
  return (
    <AbsoluteFill style={{ backgroundColor: colors.background, fontFamily: brand.font, color: colors.text, padding: 100, justifyContent: "space-between" }}>
      <div style={{ fontSize: 220, lineHeight: 0.6, color: colors.accent, fontWeight: 800 }}>“</div>
      <div style={{ fontSize, fontWeight: 700, lineHeight: 1.18, letterSpacing: -1, wordBreak: "break-word" }}>{quote}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 32, color: colors.muted }}>
        <span>{attribution ? `— ${attribution}` : brand.name}</span>
        <span>{brand.handle}</span>
      </div>
    </AbsoluteFill>
  );
};
