/** When posts go out. Times are in TIMEZONE from .env.local. Weekly cap is MAX_POSTS_PER_WEEK. */
export const schedule = {
  days: [2, 3, 4], // 0 = Sunday ... Tue, Wed, Thu tend to perform best for B2B
  times: ["09:00", "12:30"],
  minGapMinutes: 20 * 60, // about one post a day: two same-day posts split reach. The 2nd time is a fallback.
} as const;
