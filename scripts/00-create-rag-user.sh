#!/bin/bash
# 00-create-rag-user.sh
# Creates the non-privileged `rag` service account that the whole RAG stack runs under.
# The stack is deliberately isolated: `rag` is a standard user (NOT admin, no sudo),
# so a compromise of the LAN-exposed HTTP server has a blast radius of one plain account.
#
# Run this ONCE, on the Mac, as an administrator:
#   sudo bash scripts/00-create-rag-user.sh
#
# It copies the *invoking admin's* SSH authorized_keys to the new account so you can
# `ssh rag@<host>` with the same key. No password is set (ssh-key-only login).
set -euo pipefail

# The admin account whose SSH key grants access to `rag`.
# Defaults to whoever invoked sudo; override with ADMIN_USER=<name>.
ADMIN_USER="${ADMIN_USER:-${SUDO_USER:-admin}}"
ADMIN_KEYS="/Users/${ADMIN_USER}/.ssh/authorized_keys"

echo "Creating 'rag' service account (ssh key sourced from admin user: ${ADMIN_USER})"

sysadminctl -addUser rag -fullName "RAG Service" -shell /bin/zsh

mkdir -p /Users/rag/.ssh
if [ -f "${ADMIN_KEYS}" ]; then
  cp "${ADMIN_KEYS}" /Users/rag/.ssh/authorized_keys
else
  echo "WARNING: ${ADMIN_KEYS} not found."
  echo "         Add your public key to /Users/rag/.ssh/authorized_keys manually before you can ssh in."
  touch /Users/rag/.ssh/authorized_keys
fi
chown -R rag:staff /Users/rag/.ssh
chmod 700 /Users/rag/.ssh
chmod 600 /Users/rag/.ssh/authorized_keys

# Allow this account to log in over SSH (macOS Remote Login group).
dseditgroup -o edit -a rag -t user com.apple.access_ssh 2>/dev/null || true

echo "--- verification ---"
# Prove the account is NOT an administrator (privilege isolation).
dseditgroup -o checkmember -m rag admin || true
id rag
echo "Done. Next: ssh rag@<MAC_MINI_IP> and run scripts/install.sh"
