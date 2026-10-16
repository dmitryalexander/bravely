# Release preparation

Target: public `dmitryalexander/bravely`. The owner chose public visibility on October 16, 2026, superseding the earlier private preference. This is a development preview, with public-release preparation still open.

## Completed locally

- [x] Extract manifest-referenced runtime files and required page scripts.
- [x] Exclude old backup folders, unreviewed historical screenshots, handoff notes and obsolete variants.
- [x] Apply Bravely branding while retaining internal storage keys.
- [x] Remove the retired Priviblur dependency.
- [x] Make the five inherited local checks portable and compatible with current behavior.
- [x] Validate JavaScript syntax, manifest references and version consistency.
- [x] Document installation, permissions, controls and limitations.
- [x] Provide runtime-only Windows archive packaging.

## Before a public release

- [ ] Review source provenance and choose a suitable project license; retain any required upstream notices.
- [x] Reduce required host access; make broad HTTPS and localhost access optional and off by default (0.14.0).
- [ ] Verify real Brave optional-permission prompts, declined grants, revocation and upgrade behavior; automated API simulations pass.
- [ ] Load the packaged copy as an extension in Brave with Lens Wall disabled.
- [ ] Verify options saving, defaults, look toggles and extension reload behavior.
- [ ] Check Lens Visual matches, source/full-size actions and crop editing.
- [ ] Check Pinterest signed in and logged out: wall, pin panel, related pins, scrolling and two-step visual search.
- [ ] Check DeviantArt home/search/gallery/artwork and authenticated Watch/scrolling where accessible.
- [ ] Check pixiv home/search/artwork/bookmarks, page continuation, original images and Lens actions.
- [ ] Check Pinful Lens actions with and without Bravely enabled.
- [x] Add owner-supplied, visually reviewed non-adult examples for Pinterest, Google Lens, DeviantArt and pixiv to the README.
- [x] Add approved thin amber-and-black lion artwork/icons with source attribution.
- [ ] Reinstall from the final archive, record actual manual results, and create a release version/tag.

Inherited tests simulate site behavior; they do not certify the current sites or this packaged extension. The owner confirmed the original Lens Wall DeviantArt artwork appearance after turning its look back on; that is not a full verification of this preparation copy.

Pinful Lens bridge0.15.0 is implemented locally with scoped helper-tab registration/return and no new host permissions. Browser bridge mocks and all existing checks pass. A full installed-browser roundtrip is pending because computer-use could not verify the current Brave URL; do not mark this manual release check complete.


## 0.17.1 source update

The owner confirmed the previously missing Lens result now remains in the wall. Ten local harnesses cover current runtime behavior, including distinct thumbnails sharing a source and visible images with hidden destination links. This source push is a development-preview update, not a stable release/tag. Current Pinful removed the older scoped jobs/callback UI, so that legacy integration is no longer a requirement or a claim of compatibility with current Pinful. Bravely's ordinary walls and image-search actions remain independent.
