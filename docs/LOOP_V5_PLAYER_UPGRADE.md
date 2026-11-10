# LOOP V5 — Player usability upgrade

This update focuses on the existing player without replacing the playback engine.

## Added
- Global playback keyboard shortcuts: Space play/pause, Left/Right seek by 10 seconds, N next, P previous, M mute.
- Shortcuts ignore form fields, editable content, and buttons so they do not interfere with typing or normal controls.
- Clearer seek control labelling and player shortcut hints.

## Preserved
- Existing audio and official YouTube embed playback paths.
- Queue, shuffle, repeat, volume, sleep timer, immersive player, lyrics, and theme support.
- Existing backend listening-session and playback event handling.

## Validation note
A full dependency install, production build, browser test, and live provider playback test must be run in the deployment environment.
