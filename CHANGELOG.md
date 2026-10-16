# Changelog

## 0.14.0 development preview

- Limited required host access to supported sites and image servers.
- Made other HTTPS sites and local companion endpoints separately optional and off by default.
- Added immediate options switches with explicit browser approval, declined-request handling and revocation.
- Kept opt-ins installation-local and removed unselected legacy broad grants on upgrade.
- Added guarded extension fetches, permission-denied explanations and protection against leaking failed local URLs through the Google fallback.
- Added regression coverage for default-off behavior, grant/deny/revoke, upgrade handling and network boundaries.

## 0.13.0 preparation preview

- Extracted Bravely into a standalone source tree from Lens Wall 0.12.3.
- Renamed the manifest, options and diagnostic labels to Bravely.
- Removed retired Priviblur result routing and its configuration field; original source links remain.
- Retained the existing Pinterest, DeviantArt, pixiv and Lens browsing features and internal settings keys.
- Made local checks independent of the old MyApps folder layout and updated obsolete test assumptions.
- Added installation instructions, permission notes, preparation tracking and a runtime-only archive script.

This preview has no public release tag. Installed-extension verification remains open.
