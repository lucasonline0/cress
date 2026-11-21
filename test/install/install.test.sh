#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/home with spaces"
cat > "$tmp/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
url= output=
while (($#)); do
 case "$1" in --output) output=$2; shift 2;; --proto|--proto-redir|--max-time) shift 2;; https://*) url=$1; shift;; *) shift;; esac
done
[ "${TEST_FAIL:-}" != "$url" ] || exit 22
case "$url" in
 https://getcress.vercel.app/releases/linux-x86_64.txt) cp "$TEST_MANIFEST" "$output";;
 https://getcress.vercel.app/brand/icon_app.png) cp "$TEST_ICON" "$output";;
 https://github.com/lucasonline0/cress/releases/download/*) cp "$TEST_BINARY" "$output";;
 *) exit 22;;
esac
MOCK
cat > "$tmp/bin/uname" <<'MOCK'
#!/usr/bin/env bash
case "$1" in -s) printf 'Linux\n';; -m) printf '%s\n' "${TEST_ARCH:-x86_64}";; esac
MOCK
cat > "$tmp/bin/sudo" <<'MOCK'
#!/usr/bin/env bash
printf 'sudo called\n' >&2; exit 1
MOCK
chmod +x "$tmp/bin/curl" "$tmp/bin/uname" "$tmp/bin/sudo"
export PATH="$tmp/bin:$PATH" HOME="$tmp/home with spaces" TEST_ICON="$root/assets/brand/icon_app.png" TEST_BINARY="$tmp/app" TEST_MANIFEST="$tmp/manifest"
printf '#!/usr/bin/env bash\nprintf "running\\n"\n' > "$TEST_BINARY"
write_manifest() { printf 'status=ready\nversion=%s\nurl=https://github.com/lucasonline0/cress/releases/download/v%s/Cress.AppImage\nsha256=%s\n' "$1" "$1" "$2" > "$TEST_MANIFEST"; }
sha=$(sha256sum < "$TEST_BINARY"); sha=${sha%% *}; write_manifest 0.2.0 "$sha"
cat "$root/scripts/install.sh" | bash
base="$HOME/.local/opt/cress"
[ -x "$base/current/Cress.AppImage" ]
[ -f "$HOME/.local/share/applications/org.cress.desktop" ]
if command -v desktop-file-validate >/dev/null 2>&1; then desktop-file-validate "$HOME/.local/share/applications/org.cress.desktop"; fi
[ -L "$HOME/.local/bin/cress-desktop" ]
[ "$("$HOME/.local/bin/cress-desktop")" = running ]
first=$(readlink "$base/current")
bash "$root/scripts/install.sh"
[ "$(readlink "$base/current")" = "$first" ]
write_manifest 0.2.1 "$(printf '0%.0s' {1..64})"
if bash "$root/scripts/install.sh" > /dev/null 2>&1; then echo 'checksum failure accepted' >&2; exit 1; fi
[ "$(readlink "$base/current")" = "$first" ]
write_manifest 0.2.1 "$sha"
if TEST_FAIL='https://github.com/lucasonline0/cress/releases/download/v0.2.1/Cress.AppImage' bash "$root/scripts/install.sh" > /dev/null 2>&1; then echo 'network failure accepted' >&2; exit 1; fi
[ "$(readlink "$base/current")" = "$first" ]
if TEST_ARCH=aarch64 bash "$root/scripts/install.sh" > /dev/null 2>&1; then echo 'unsupported architecture accepted' >&2; exit 1; fi
bash "$root/scripts/install.sh"
[ "$(readlink "$base/current")" != "$first" ]
[ -f "$first/Cress.AppImage" ]
if [ -n "${CRESS_TEST_REAL_APPIMAGE:-}" ]; then
  export TEST_BINARY="$CRESS_TEST_REAL_APPIMAGE"
  sha=$(sha256sum < "$TEST_BINARY"); sha=${sha%% *}; write_manifest 0.2.2 "$sha"
  bash "$root/scripts/install.sh"
  env PATH=/tmp/cress-nogo-bin APPIMAGE_EXTRACT_AND_RUN=1 CRESS_PACKAGED_EXECUTABLE="$base/cress-desktop" /usr/bin/node "$CRESS_GUI_TEST"
fi
printf 'Installer checks passed: clean install, pipe, repeat, update, failure preservation, architecture and launcher.\n'
