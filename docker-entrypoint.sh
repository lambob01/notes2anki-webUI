#!/bin/sh
set -e

# A bind-mounted ./data from the host arrives owned by the host user, which
# overrides whatever the image set. Fix ownership before dropping privileges,
# otherwise SQLite cannot create its WAL files.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/exports" "$DATA_DIR/history" "$DATA_DIR/slides"
  chown -R app:app "$DATA_DIR"
  # setpriv (util-linux, present in the Debian slim base) drops privileges with
  # argv preserved and signals delivered direct to the child. The old
  # `su app -c "$*"` flattened argv into a string (an argument containing a
  # space broke) and su does not forward SIGTERM, so `docker stop` waited the
  # full timeout. HOME is set explicitly because dropping uid does not touch it.
  exec setpriv --reuid=app --regid=app --init-groups -- env HOME=/home/app "$@"
fi

mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/exports" "$DATA_DIR/history" "$DATA_DIR/slides"
exec "$@"
