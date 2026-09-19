/** The plan the LLM produces for a post's visual. Also the inputProps of the compositions. */
export type MediaSpec =
  | { kind: "carousel"; slides: { heading: string; body?: string }[] }
  | { kind: "image"; quote: string; attribution?: string }
  | { kind: "video"; stat: { value: string; label: string }; bullets: string[] };

export type CarouselSlideProps = {
  heading: string;
  body?: string;
  index: number;
  total: number;
};

export type QuoteCardProps = { quote: string; attribution?: string };

export type StatVideoProps = { value: string; label: string; bullets: string[] };
