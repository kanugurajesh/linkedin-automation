import React from "react";
import { Composition, Still } from "remotion";
import { CarouselSlide } from "./CarouselSlide";
import { QuoteCard } from "./QuoteCard";
import { STAT_DURATION, STAT_FPS, StatVideo } from "./StatVideo";

// 4:5 portrait uses the most feed space on mobile.
export const WIDTH = 1080;
export const HEIGHT = 1350;

export const RemotionRoot: React.FC = () => (
  <>
    <Still
      id="CarouselSlide"
      component={CarouselSlide}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ heading: "Your headline goes here", body: "Supporting line", index: 0, total: 5 }}
    />
    <Still id="QuoteCard" component={QuoteCard} width={WIDTH} height={HEIGHT} defaultProps={{ quote: "A sentence worth sharing.", attribution: "Someone" }} />
    <Composition
      id="StatVideo"
      component={StatVideo}
      width={WIDTH}
      height={HEIGHT}
      fps={STAT_FPS}
      durationInFrames={STAT_DURATION}
      defaultProps={{ value: "73%", label: "of teams did the thing", bullets: ["First point", "Second point", "Third point"] }}
    />
  </>
);
