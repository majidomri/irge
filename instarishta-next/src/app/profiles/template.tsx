// template.tsx remounts on every navigation to /profiles, unlike layout.tsx which persists.
// Effect: SwipeDeck resets to card #1, all filter state clears, scroll position resets.
export default function ProfilesTemplate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
