// The logic under test is pure: it reads only these two settings, so no keys, network or database are needed.
process.env.TIMEZONE = "Asia/Kolkata";
process.env.MAX_POSTS_PER_WEEK = "4";
