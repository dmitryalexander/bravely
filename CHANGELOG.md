# 0.17.1

Keep distinct visible Lens thumbnails from a shared source page and thumbnails without an extractable destination. Avoid assigning a neighboring card's source link. The owner confirmed the missing-image case was fixed. Approved thin amber lion icon; existing permissions unchanged.

Current Pinful no longer uses the older scoped Lens-job bridge. Bravely remains independent; legacy bridge scripts are inactive without an explicitly registered older helper job.

# 0.17.0

Pinful helpers now open the Pinterest visual match and return its loaded image grid. Handles regional Pinterest links and encrypted Google destination links. No exact-image requirement or recommendations API is needed to import the page images. Companion permissions and amber lion icon unchanged.

# 0.16.1

Replace the falcon with an amber Brave lion outline matching the companion app icons.

# 0.16.0

Amber falcon/lens icon; corrected displayed version. Pinful Lens helpers read Google result metadata and standard Pinterest links without waiting for the custom wall, and retry failed returns.

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


## 0.15.0 — October 16, 2026

- Add Pinful's explicit Lens-search job handoff and Pinterest result return.
- Keep ordinary Lens searches independent; no new host grants.
- Add scoped helper-tab and callback tests. Full real-browser verification pending.
