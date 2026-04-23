# Fold Direct Children

Fold Direct Children adds a single editor command that toggles the direct child folding ranges of the current scope, without collapsing the current scope itself.

## Important
Assign a keyboard shortcut to `Fold Direct Children: Toggle Direct Child Folds` in VS Code's Keyboard Shortcuts UI before first use. This extension does not ship with a default shortcut.

## Features

- Toggle the direct children of the scope under the cursor.
- Keep the current scope expanded.
- Preserve the current selection and viewport when the cursor is outside the newly hidden ranges.
- At file top level, prefer folding top-level type declarations such as classes, interfaces, structs, and enums.

## Shortcut Setup

1. Open Keyboard Shortcuts in VS Code.
2. Search for `Fold Direct Children: Toggle Direct Child Folds`.
3. Assign the key you want.

## Command

- `Fold Direct Children: Toggle Direct Child Folds`
