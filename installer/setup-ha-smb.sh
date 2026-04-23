#!/usr/bin/env bash
# Install idempotent fstab entries for Home Assistant's /config and
# /backup SMB shares, so the mirror box auto-remounts them after HA
# restarts or network blips.
#
# Run as root:
#
#   sudo bash /opt/mirror/installer/setup-ha-smb.sh --ha-host 192.168.20.11
#
# Credentials come from /etc/mirror/smb.creds (same file used by the
# original manual mount). The fstab uses x-systemd.automount so the
# mount happens on first access, not at boot — boot doesn't hang when
# HA is down, and the mount revives on demand after HA restarts.

set -euo pipefail

HA_HOST=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ha-host) HA_HOST="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      echo "usage: sudo bash $0 --ha-host <ip-or-hostname>"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "must run as root" >&2; exit 1
fi
if [[ -z "$HA_HOST" ]]; then
  echo "missing --ha-host" >&2; exit 2
fi

CREDS="/etc/mirror/smb.creds"
if [[ ! -f "$CREDS" ]]; then
  echo "credentials file $CREDS missing — cannot configure fstab" >&2
  exit 1
fi

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "+ $*"
  else
    "$@"
  fi
}

# cifs-utils for the mount.cifs binary.
if ! dpkg -s cifs-utils >/dev/null 2>&1; then
  run apt-get update -qq
  run apt-get install -y --no-install-recommends cifs-utils
fi

run install -d -m 0755 /mnt/ha-config /mnt/ha-backup

OPTS="credentials=$CREDS,uid=1000,gid=1000,file_mode=0755,dir_mode=0755,_netdev,nofail,x-systemd.automount,x-systemd.idle-timeout=600"
LINE_CONFIG="//$HA_HOST/config /mnt/ha-config cifs $OPTS 0 0"
LINE_BACKUP="//$HA_HOST/backup /mnt/ha-backup cifs $OPTS 0 0"

add_fstab_entry() {
  local line="$1"
  local dest
  dest=$(awk '{print $2}' <<<"$line")
  # Drop any prior entry for this mountpoint (idempotent) before adding.
  if grep -qE "^[^#]*\s$dest\s+cifs" /etc/fstab; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "+ sed -i strip old fstab entry for $dest"
    else
      sed -i.bak -E "\#^[^#]*\s$dest\s+cifs#d" /etc/fstab
    fi
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "+ append to /etc/fstab: $line"
  else
    printf '%s\n' "$line" >> /etc/fstab
    echo "added fstab entry for $dest"
  fi
}

add_fstab_entry "$LINE_CONFIG"
add_fstab_entry "$LINE_BACKUP"

run systemctl daemon-reload
# Trigger an immediate mount of both; automount handles re-mount on access.
run mount -a -O _netdev || true

echo "[setup-ha-smb] done"
findmnt /mnt/ha-config || true
findmnt /mnt/ha-backup || true
