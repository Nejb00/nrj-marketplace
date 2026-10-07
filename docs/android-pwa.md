# NRJ Marketplace — PWA to Android

NRJ Marketplace is packaged as a Trusted Web Activity (TWA) so the existing PWA remains the product surface while Android provides the application shell.

## What is automated

- PWA quality validation with Bubblewrap.
- TWA configuration tracked in Git.
- Reproducible Android project generation from the TWA manifest.
- Unsigned build for CI smoke testing.
- Signed release APK/AAB when the protected Android signing secrets are present.
- Release Digital Asset Links generation from the actual signing certificate.
- APK and AAB uploaded as workflow artifacts.

## One-time production prerequisite

The only protected manual prerequisite is the production signing identity. The private keystore must not be stored in the repository. Add the release keystore and passwords to GitHub Actions secrets, then run the Android package workflow in release mode.

Do not publish an `assetlinks.json` containing a test/debug certificate as the production association.

## Android-specific roadmap

Current PWA capabilities already include offline caching, product sharing, camera/photo selection and voice search.

Possible Android enhancements that can be layered on later without rewriting the marketplace:

- Push notifications through the web Notifications/Push APIs.
- Stronger deep-link/App Links handling.
- Share-target handling for supported Android share flows.
- More robust first-launch/offline UX.

The base packaging deliberately avoids unnecessary native duplication.
