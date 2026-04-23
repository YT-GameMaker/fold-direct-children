# Change Log

All notable changes to the "fold-direct-children" extension will be documented in this file.

## [0.1.0] - 2026-04-23

- First formal project version for publishing.
- Added a contributed command and default keyboard shortcut visible in VS Code's Keyboard Shortcuts UI.
- Implemented direct-child fold toggling without collapsing the current scope itself.
- Preserved top-level behavior that prefers folding top-level type declarations.
- Preserved cursor and viewport whenever the resulting hidden ranges still allow it.
