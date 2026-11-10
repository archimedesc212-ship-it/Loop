/**
 * Mana Universal Icon Kit — React wrapper for Lucide icons.
 * Adapted from the supplied kit's src/Icon.tsx for this Vite JavaScript app.
 * Keep size and stroke defaults consistent across the LOOP interface.
 */
export function AppIcon({ icon: Icon, size = 18, strokeWidth = 1.8, ...props }) {
  if (!Icon) return null;
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" {...props} />;
}
