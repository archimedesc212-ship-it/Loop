# Mana Universal Icon Kit in LOOP

The supplied Mana kit is integrated through `AppIcon`, adapted from the kit's
`src/Icon.tsx` to JSX for this Vite application. General interface icons are
imported from `lucide-react` and rendered through the wrapper to keep icon size
and stroke width consistent.

The provider metadata registry is retained for future integrations. LOOP's
basic listener experience does not currently need AI-provider brand marks, so
`@lobehub/icons` is intentionally not installed as an unused dependency.
