# Sheet Link

## 2.1.1 - 2025-08-11

### Bug Fixes

#### rolodex
- Fixed an issue rendering sheet tabs with different tokens using the same unlinked actor

## 2.1.0 - 2025-06-18

### New Features

#### rolodex
- Adds an option to open the rolodex with all NPC sheets when a combat encounter starts (#4)

### Bug Fixes

#### rolodex

- Added horizontal scrollbar to the tab container when many sheets are open
- Added a hook to remove rolodex sheets when closed externally (fixes #3)

## 2.0.0 - 2025-06-09

### Breaking Changes

- Compatibility verified for FoundryVTT 13.343 and PF2e 7.1.1
- Refactored to use ApplicationV2
- Deprecated support for older FVTT and system versions (various hooks and rendering paths have changed)

### New Features

#### rolodex

- Combat synchronization: replaced the "Link to Combat" setting with "Sync with Combat" to sync both the selected tab
  and the tab sort order with the active combat
- Added "Remove on Death" option to remove a rolodex sheet when an actor in the active combat reaches 0 HP

## 1.1.0 - 2024-09-25

### New Features

#### rolodex

- Added indicator to highlight tokens with associated tabs when hovered
- Introduced "Link to Combat" setting, which selects the rolodex tab for actors in active combat encounters
- Added active combatant indicator
- Added double-click handler to rolodex tabs, which selects the actor's token and pans to its view position
- Added keybinding to open the rolodex preloaded with all selected actors

## 1.0.0 - 2024-09-18

### Initial release
