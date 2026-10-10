// Which sentence of a prompt the rule band offers to remember.

// A sentence that sets a standing rule opens with one of these phrasings.
const RULE = /^(?:please\s+)?(?:from now on|always|never|don['’]t ever|do not ever|stop doing)\b/i

// The rule-like sentence of a prompt the person typed, if any:
//   "from now on use pnpm. Thanks"            → "from now on use pnpm."
//   "Looks good. Never push to main!"         → "Never push to main!"
//   "remember: always squash", "record-team: never force-push",
//   "/review always", a plugin's "always run tests" → undefined
export const findRule = ({ text, origin }: { text: string; origin: string }): string | undefined => {
  const trimmed = text.trim()
  const isPerson = origin === 'composer' || origin === 'bridge'
  if (!isPerson || trimmed.startsWith('/') || /remember|record-team:/i.test(trimmed)) return undefined
  return trimmed.split(/(?<=[.!?])\s+|\n+/).map(one => one.trim()).find(one => RULE.test(one))
}
