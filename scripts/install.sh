#!/usr/bin/env bash
# Installs a published Cress AppImage for the current user. No project code is run.
set -euo pipefail

fail() { printf 'Cress: %s\n' "$*" >&2; exit 1; }
[ "$(uname -s)" = Linux ] || fail 'Only Linux is supported by this installer.'
[ "$(uname -m)" = x86_64 ] || fail 'Only Linux x86_64 is supported.'
for tool in curl sha256sum mktemp mv ln mkdir chmod readlink grep rm cp; do command -v "$tool" >/dev/null 2>&1 || fail "Required command not found: $tool"; done
case "${HOME:-}" in /*) ;; *) fail 'HOME must be an absolute directory.';; esac
case "$HOME${XDG_DATA_HOME:-}" in *$'\n'*|*$'\r'*) fail 'Directory paths containing newlines are not supported.';; esac

manifest_url='https://getcress.vercel.app/releases/linux-x86_64.txt'
icon_url='https://getcress.vercel.app/brand/icon_app.png'
icon_sha='d99353f679b5441b0748532445cd07d4d457bb20b8d5476f9521e0b7d72d01fe'
base="$HOME/.local/opt/cress"
data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
case "$data_home" in /*) ;; *) fail 'XDG_DATA_HOME must be an absolute directory.';; esac
bin="$HOME/.local/bin"
launcher="$base/cress-desktop"
desktop="$data_home/applications/org.cress.desktop"
command_link="$bin/cress-desktop"
mkdir -p "$base/releases" "$data_home/applications" "$bin"
stage=$(mktemp -d "$base/.install.XXXXXXXX") || fail 'Cannot create a temporary installation directory.'
cleanup() { if [ -n "${stage:-}" ] && [ -d "$stage" ]; then rm -rf -- "$stage"; fi; }
trap cleanup EXIT
fetch() { curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --max-time 600 "$1" --output "$2" || fail "Download failed: $1"; }
if [ -n "${CRESS_UPDATER_MANIFEST_FILE:-}" ]; then
  [ -f "$CRESS_UPDATER_MANIFEST_FILE" ] && [ -r "$CRESS_UPDATER_MANIFEST_FILE" ] || fail 'The local update manifest cannot be read.'
  cp -- "$CRESS_UPDATER_MANIFEST_FILE" "$stage/manifest"
else
  fetch "$manifest_url" "$stage/manifest"
fi
status= version= url= sha256=
while IFS='=' read -r key value || [ -n "$key" ]; do
  case "$key" in
    status) [ -z "$status" ] || fail 'Invalid release manifest.'; status=$value ;;
    version) [ -z "$version" ] || fail 'Invalid release manifest.'; version=$value ;;
    url) [ -z "$url" ] || fail 'Invalid release manifest.'; url=$value ;;
    sha256) [ -z "$sha256" ] || fail 'Invalid release manifest.'; sha256=$value ;;
    '') ;;
    *) fail 'Invalid release manifest.' ;;
  esac
done < "$stage/manifest"
[ "$status" = ready ] || fail 'A public Linux release is not available yet.'
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'Invalid release version.'
[[ "$sha256" =~ ^[a-f0-9]{64}$ ]] || fail 'Invalid release checksum.'
[[ "$url" =~ ^https://github\.com/lucasonline0/cress/releases/download/[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+\.AppImage$ ]] || fail 'Release URL is not an allowed official GitHub release URL.'
if [ -n "${CRESS_UPDATER_APPIMAGE_FILE:-}" ]; then
  [ -f "$CRESS_UPDATER_APPIMAGE_FILE" ] && [ -r "$CRESS_UPDATER_APPIMAGE_FILE" ] || fail 'The downloaded update file cannot be read.'
  cp -- "$CRESS_UPDATER_APPIMAGE_FILE" "$stage/Cress.AppImage"
else
  fetch "$url" "$stage/Cress.AppImage"
fi
actual=$(sha256sum < "$stage/Cress.AppImage"); actual=${actual%% *}
[ "$actual" = "$sha256" ] || fail 'AppImage checksum verification failed; the existing installation was preserved.'
fetch "$icon_url" "$stage/icon.png"
actual=$(sha256sum < "$stage/icon.png"); actual=${actual%% *}
[ "$actual" = "$icon_sha" ] || fail 'Icon checksum verification failed; the existing installation was preserved.'
chmod 755 "$stage/Cress.AppImage"
if [ -e "$base/current" ] && [ ! -L "$base/current" ]; then fail 'Refusing to replace a non-symlink installation directory.'; fi
if [ -e "$command_link" ] || [ -L "$command_link" ]; then
  [ -L "$command_link" ] && [ "$(readlink "$command_link")" = "$launcher" ] || fail "Refusing to replace existing command: $command_link"
fi
if [ -e "$desktop" ] && ! grep -Fxq 'X-Cress-Installer=true' "$desktop"; then fail "Refusing to replace existing desktop entry: $desktop"; fi
# A fixed launcher avoids evaluating any data from the release manifest.
printf '#!/usr/bin/env bash\nset -e\napp=%q\nif [ ! -r /dev/fuse ] || [ ! -w /dev/fuse ] || { ! command -v fusermount3 >/dev/null 2>&1 && ! command -v fusermount >/dev/null 2>&1; }; then\n  export APPIMAGE_EXTRACT_AND_RUN=1\nfi\nexec "$app" "$@"\n' "$base/current/Cress.AppImage" > "$stage/launcher"
chmod 755 "$stage/launcher"
# Desktop entry Exec escaping follows the freedesktop double-quoted argument rules.
desktop_escape() { local v=$1; v=${v//\\/\\\\}; v=${v//\"/\\\"}; v=${v//\$/\\\$}; v=${v//\`/\\\`}; v=${v//%/%%}; printf '%s' "$v"; }
{
  printf '[Desktop Entry]\nType=Application\nName=Cress\nComment=Explore API authorization declarations\n'
  printf 'Exec="%s"\n' "$(desktop_escape "$launcher")"
  icon_path="$base/current/icon.png"; icon_path=${icon_path//\\/\\\\}
  printf 'Icon=%s\n' "$icon_path"
  printf 'Terminal=false\nCategories=Development;\nStartupWMClass=cress\nX-Cress-Installer=true\n'
} > "$stage/entry.desktop"
release="$base/releases/$version-$sha256"
if [ -e "$release" ]; then
  [ -d "$release" ] && [ ! -L "$release" ] || fail 'Release destination is not a directory.'
  [ -f "$release/Cress.AppImage" ] && [ -f "$release/icon.png" ] || fail 'Existing release is incomplete; remove it manually before retrying.'
  actual=$(sha256sum < "$release/Cress.AppImage"); actual=${actual%% *}
  [ "$actual" = "$sha256" ] || fail 'Existing release has an invalid checksum; remove it manually before retrying.'
  actual=$(sha256sum < "$release/icon.png"); actual=${actual%% *}
  [ "$actual" = "$icon_sha" ] || fail 'Existing release has an invalid icon; remove it manually before retrying.'
else
  mkdir "$stage/release"
  mv "$stage/Cress.AppImage" "$stage/icon.png" "$stage/release/"
  mv "$stage/release" "$release"
fi
# Keep prior releases in place; only the current symlink changes atomically.
ln -s "$release" "$stage/current"
mv -fT "$stage/launcher" "$launcher"
mv -fT "$stage/entry.desktop" "$desktop"
if [ ! -L "$command_link" ]; then ln -s "$launcher" "$command_link"; fi
mv -fT "$stage/current" "$base/current"
if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database "$data_home/applications" >/dev/null 2>&1 || true; fi
printf 'Cress %s installed. Open Cress from your application menu.\n' "$version"
if [ ! -r /dev/fuse ] || [ ! -w /dev/fuse ] || { ! command -v fusermount3 >/dev/null 2>&1 && ! command -v fusermount >/dev/null 2>&1; }; then
  printf 'FUSE is unavailable; Cress will use the AppImage extraction fallback when launched.\n'
fi
