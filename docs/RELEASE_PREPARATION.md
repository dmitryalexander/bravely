# Release preparation

Target: public `dmitryalexander/bravely`. The owner chose public visibility on October 16, 2026, superseding the earlier private preference. This is a development preview, with public-release preparation still open.

## Completed locally

- [x] Extract manifest-referenced runtime files and required page scripts.
- [x] Exclude old backup folders, screenshots, handoff notes and obsolete variants.
- [x] Apply Bravely branding while retaining internal storage keys.
- [x] Remove the retired Priviblur dependency.
- [x] Make the five inherited local checks portable and compatible with current behavior.
- [x] Validate JavaScript syntax, manifest references and version consistency.
- [x] Document installation, permissions, controls and limitations.
- [x] Provide runtime-only Windows archive packaging.

## Before a public release

- [ ] Review source provenance and choose a suitable project license; retain any required upstream notices.
- [ ] Review broad host access and document/reduce it according to shipped functionality.
- [ ] Load the packaged copy as an extension in Brave with Lens Wall disabled.
- [ ] Verify options saving, defaults, look toggles and extension reload behavior.
- [ ] Check Lens Visual matches, source/full-size actions and crop editing.
- [ ] Check Pinterest signed in and logged out: wall, pin panel, related pins, scrolling and two-step visual search.
- [ ] Check DeviantArt home/search/gallery/artwork and authenticated Watch/scrolling where accessible.
- [ ] Check pixiv home/search/artwork/bookmarks, page continuation, original images and Lens actions.
- [ ] Check Pinfull Lens actions with and without Bravely enabled.
- [ ] Capture nonpersonal screenshots and add final extension artwork/icons if desired.
- [ ] Reinstall from the final archive, record actual manual results, and create a release version/tag.

Inherited tests simulate site behavior; they do not certify the current sites or this packaged extension. The owner confirmed the original Lens Wall DeviantArt artwork appearance after turning its look back on; that is not a full verification of this preparation copy.
