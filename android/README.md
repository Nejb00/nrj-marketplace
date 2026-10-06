# NRJ Marketplace — Android packaging

This directory contains the canonical Bubblewrap/TWA configuration for the NRJ Marketplace PWA.

## Source of truth

- Web app: https://nrj-marketplace.vercel.app/
- Web manifest: https://nrj-marketplace.vercel.app/manifest.webmanifest
- TWA manifest: `android/twa-manifest.json`
- Android package id: `com.nrj.marketplace`

The Android project itself is generated from `twa-manifest.json` by Bubblewrap. Generated Gradle/project files are intentionally not committed as the long-term source of truth.

## Local generation

Install Bubblewrap and generate the Android project:

1. Run Bubblewrap `update` against `android/twa-manifest.json`.
2. Run Bubblewrap `build` for an unsigned test package or a signed release package.
3. Keep the signing keystore outside Git.

## Release signing

For a production Android release, keep the signing keystore private. The release workflow expects the following GitHub Actions secrets:

- `NRJ_ANDROID_KEYSTORE_BASE64`
- `NRJ_ANDROID_KEYSTORE_PASSWORD`
- `NRJ_ANDROID_KEY_PASSWORD`

The workflow also generates the Digital Asset Links JSON from the actual release certificate. The generated file must only be published to `/.well-known/assetlinks.json` for the certificate that users will actually receive. Never commit a private keystore.

## Digital Asset Links

After a production signing key exists, the release workflow produces `assetlinks.json` as a build artifact. It must be served at:

`https://nrj-marketplace.vercel.app/.well-known/assetlinks.json`

The fingerprint must match the certificate used by the installed production app. When Google Play App Signing is used, use the Play app-signing certificate fingerprint for the production association.
