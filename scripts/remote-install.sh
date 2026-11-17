#!/bin/bash
# Runs on the Evalve EC2 server as root. deploy-dashboard.sh sends it through
# AWS Systems Manager; you don't run this file yourself.
#
# It installs the built dashboard and gives Caddy a second hostname,
# dashboard.<kitaru hostname>, that serves those files and forwards /api to
# Kitaru. The Kitaru site keeps its own hostname and config. If Caddy does not
# come back healthy, the previous Caddy setup is restored.
#
# A server from evalve-deploy with /etc/evalve/sites owns its Caddyfile, which
# imports every file in that folder. There this script writes only
# sites/dashboard.caddy, so routes such as /evalve/* stay. On an older server
# without the folder, it rewrites the whole Caddyfile as before.
set -eu
umask 022
url=$1
sha=$2

host=$(python3 -c 'import json; print(json.load(open("/etc/evalve/config.json"))["hostname"])')
dash="dashboard.$host"
unit=/etc/systemd/system/evalve-caddy.service
caddyfile=/etc/evalve/Caddyfile
sites=/etc/evalve/sites
site=/etc/evalve/dashboard
image=$(grep -o 'caddy@sha256:[a-f0-9]\{64\}' "$unit" | head -n 1)
test -n "$image"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# 1. Download the build and check it is the file that was uploaded.
curl --fail --silent --show-error --retry 3 -o "$tmp/ui.tgz" "$url"
echo "$sha  $tmp/ui.tgz" | sha256sum --check --quiet
mkdir "$tmp/site"
tar -xzf "$tmp/ui.tgz" -C "$tmp/site"
test -f "$tmp/site/index.html"

# Keep the folder itself, because Caddy mounts it. Replace what is inside.
install -d -m 755 "$site"
find "$site" -mindepth 1 -delete
cp -R "$tmp/site/." "$site/"

# 2. The dashboard site. Kitaru sees its own hostname on /api calls, the same
#    as the Vite dev proxy.
cat > "$tmp/dashboard.caddy" <<CADDY
$dash {
  encode gzip
  handle /api/* {
    reverse_proxy 127.0.0.1:8000 {
      header_up Host $host
    }
  }
  handle {
    root * /srv/dashboard
    try_files {path} /index.html
    file_server
  }
}
CADDY

# Validate what Caddy will load: on a split server, the Caddyfile of
# evalve-deploy with the other site files and the new dashboard file; on an
# older server, the Kitaru site exactly as bootstrap wrote it plus the dashboard.
mkdir "$tmp/sites"
if [ -d "$sites" ]; then
  cp -R "$sites/." "$tmp/sites/"
  cp "$tmp/dashboard.caddy" "$tmp/sites/dashboard.caddy"
  config=$caddyfile
else
  cat > "$tmp/Caddyfile" <<CADDY
{
  admin off
}

$host {
  reverse_proxy 127.0.0.1:8000
}

CADDY
  cat "$tmp/dashboard.caddy" >> "$tmp/Caddyfile"
  config=$tmp/Caddyfile
fi

docker run --rm \
  --mount type=bind,src="$config",dst=/etc/caddy/Caddyfile,readonly \
  --mount type=bind,src="$tmp/sites",dst=/etc/caddy/sites,readonly \
  --mount type=bind,src="$site",dst=/srv/dashboard,readonly \
  "$image" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile > "$tmp/validate.log" 2>&1 || {
  cat "$tmp/validate.log" >&2
  echo "The new Caddy config is not valid. Nothing was changed." >&2
  exit 1
}

# 3. Swap the config in, keeping this run's previous files for a rollback.
cp -p "$unit" "$tmp/unit.prev"
if [ -d "$sites" ]; then
  if [ -f "$sites/dashboard.caddy" ]; then
    cp -p "$sites/dashboard.caddy" "$tmp/dashboard.prev"
  fi
else
  cp -p "$caddyfile" "$tmp/Caddyfile.prev"
fi

rollback() {
  if [ -d "$sites" ]; then
    if [ -f "$tmp/dashboard.prev" ]; then
      install -m 644 "$tmp/dashboard.prev" "$sites/dashboard.caddy"
    else
      rm -f "$sites/dashboard.caddy"
    fi
  else
    install -m 644 "$tmp/Caddyfile.prev" "$caddyfile"
  fi
  cp -p "$tmp/unit.prev" "$unit"
  systemctl daemon-reload
  systemctl restart evalve-caddy.service
}

python3 - "$unit" <<'PY'
import sys

path = sys.argv[1]
text = open(path).read()
anchor = "  --mount type=bind,src=/etc/evalve/Caddyfile,dst=/etc/caddy/Caddyfile,readonly \\\n"
mount = "  --mount type=bind,src=/etc/evalve/dashboard,dst=/srv/dashboard,readonly \\\n"
if "dst=/srv/dashboard" not in text:
    if anchor not in text:
        sys.exit("The Caddy service file is not the one this script expects. Nothing was changed.")
    open(path, "w").write(text.replace(anchor, anchor + mount))
PY

if [ -d "$sites" ]; then
  install -m 644 "$tmp/dashboard.caddy" "$sites/dashboard.caddy"
else
  install -m 644 "$tmp/Caddyfile" "$caddyfile"
fi
systemctl daemon-reload
systemctl restart evalve-caddy.service

# Any HTTP answer that is not a server error means TLS and the proxy work.
answers() {
  for attempt in $(seq 1 "$3"); do
    code=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 \
      --resolve "$1:443:127.0.0.1" "https://$1$2" || true)
    case "$code" in 2*|3*|4*) return 0 ;; esac
    sleep 3
  done
  return 1
}

if ! answers "$host" / 20; then
  rollback
  echo "Kitaru stopped answering at https://$host after the change, so the previous Caddy setup was restored." >&2
  exit 1
fi

# The dashboard hostname needs a new certificate, which can take a minute.
if answers "$dash" / 30; then
  echo "Dashboard is live at https://$dash"
else
  echo "Installed, but https://$dash is not answering yet. Caddy may still be getting its certificate; try the URL in a minute."
fi
