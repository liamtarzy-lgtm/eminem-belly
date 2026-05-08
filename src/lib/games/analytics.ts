// Lightweight analytics-style hooks. Replace with a real analytics SDK
// later (PostHog, Mixpanel, etc.); these console.logs are placeholders so
// the call sites are already wired.

type EventName =
  | "game_started"
  | "question_answered"
  | "game_completed"
  | "hint_used"
  | "replay_used";

export function trackEvent(
  event: EventName,
  props: Record<string, string | number | boolean | undefined> = {},
) {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line no-console
  console.log(`[games] ${event}`, props);
}
