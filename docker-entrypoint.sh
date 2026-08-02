#!/bin/sh
set -e

# A bind-mounted ./data from the host arrives owned by the host user, which
# overrides whatever the image set. Fix ownership before dropping privileges,
# otherwise SQLite cannot create its WAL files.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/exports" "$DATA_DIR/history" "$DATA_DIR/slides"
  chown -R app:app "$DATA_DIR"
  exec su app -c "$*"
fi

mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/exports" "$DATA_DIR/history" "$DATA_DIR/slides"
exec "$@"
