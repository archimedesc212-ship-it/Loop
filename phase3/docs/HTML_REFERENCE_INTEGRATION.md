# HTML Design Reference Integration

The supplied standalone HTML file has been preserved at `docs/reference/loop-v9-html-design-reference.html` as a design and behavior reference.

The existing V9 React application remains the primary application. The reference file is not substituted for the React app because it contains a simulated progress timer and UI state that is not connected to actual media playback. It also includes navigation items whose pages are not implemented in that standalone file.

## Reference elements to carry forward

- LOOP dark interface with green accent styling
- Sidebar navigation and language filters
- Featured album banner and song cards
- Mood Station categories
- Multilingual music sections
- Persistent mini-player and expanded Now Playing layout
- Responsive card and navigation patterns

## Important implementation caveats

- The HTML's timer increments React state independently of a media player's real playback state. It must not be treated as proof of audio playback.
- The YouTube IFrame API script is loaded, but the supplied file does not instantiate and control a YouTube player instance. Real play/pause, seek, duration, volume, and state events require a connected player implementation.
- Explore, playlists, and recently played are shown as navigation items but are not fully rendered as pages in the supplied HTML.
- Hard-coded YouTube IDs and catalogue metadata must be validated; `playable: true` alone does not establish that a video is embeddable or playable.

Use the existing React application components and services for actual functionality. Treat this HTML as a visual reference only unless a feature is independently implemented and tested in the main application.
