# Linux installer release preparation

The installer is not available to users until an official public GitHub Release and a verified website deployment exist. It uses a small HTTPS manifest hosted by the website; `status=unavailable` is intentionally the default. Do not publish a release or enable the manifest without authorization.

After an authorized release is prepared:

1. Build and verify the Linux x86_64 AppImage and compute its SHA-256 with `sha256sum`.
2. Publish that exact AppImage as an asset of a stable release in `lucasonline0/cress`. Do not use expiring Actions artifacts as the permanent distribution source.
3. In the website's `public/releases/linux-x86_64.txt`, set four lines: `status=ready`, `version=` followed by the numeric stable version, `url=` followed by the exact HTTPS GitHub release asset URL, and `sha256=` followed by the lowercase 64-character digest. The URL must be under `https://github.com/lucasonline0/cress/releases/download/` and end in `.AppImage`.
4. Ensure the website's `public/install.sh` matches `scripts/install.sh` and `public/brand/icon_app.png` matches the official icon; update the pinned icon digest in both scripts if the icon changes. Deploy only after approval.
5. Verify the deployed script is served as plain text, and perform an unauthenticated clean installation and launch on Linux. Only then remove the website's unavailable notice and document the one-command installation as working.

Update the manifest whenever the latest stable Linux release changes. The HTTPS manifest supplies the digest, so the SHA-256 check verifies the downloaded bytes against that manifest; it is not an independent cryptographic signature. The installer requires standard Linux tools including Bash, curl and sha256sum, supports x86_64, uses user-owned directories, and uses AppImage's extraction fallback when FUSE is unavailable. Existing installations are retained if a download or checksum check fails.
