import uuid

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import DATABASE_URL

IS_SQLITE = "sqlite" in DATABASE_URL

# The macOS system libsqlite3 (3.43.2) was blamed for segfaulting under
# concurrent access from the generation background task and the status-polling
# requests, taking the whole server down. pysqlite3 bundles a modern SQLite.
#
# That attribution is doubtful. It was made while the fan-out was also sharing
# one Session across threads (TODO item 1) - the documented-unsafe pattern the
# crash is equally consistent with, and which has since been fixed. Replaying
# the app's access pattern (40 slides, 8 worker threads, 2 pollers, per-slide
# commits on the main Session) 10x against stdlib 3.43.2 now completes clean,
# as does pysqlite3.
#
# Kept anyway: 10 rounds of a synthetic workload does not disprove a
# probabilistic segfault, and the failure mode is the whole server dying. If
# you want to drop it, get evidence from the real pipeline under real load
# first - the cost of being wrong is much higher than one dependency.
if IS_SQLITE:
    import pysqlite3 as sqlite3

    engine = create_engine(
        DATABASE_URL,
        echo=False,
        module=sqlite3,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(DATABASE_URL, echo=False)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if IS_SQLITE:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def generate_uuid():
    return str(uuid.uuid4())


def ensure_columns():
    """Add columns that exist on the models but not yet in the database.

    ``Base.metadata.create_all`` creates missing *tables* but never alters an
    existing one, so a new column on an existing table would silently never
    appear. This handles the additive case, which is all the schema has needed
    so far; anything destructive should move to a real migration tool.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # create_all will handle it
            present = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in present:
                    continue
                ddl = column.type.compile(engine.dialect)

                # ADD COLUMN backfills existing rows with NULL. A SQLAlchemy
                # `default=` only fires on INSERT, so without an explicit
                # DEFAULT here every pre-existing row gets NULL - which then
                # fails response validation for a non-Optional field.
                default_sql = ""
                arg = getattr(column.default, "arg", None)
                if arg is not None and not callable(arg):
                    literal = f"'{arg}'" if isinstance(arg, str) else arg
                    default_sql = f" NOT NULL DEFAULT {literal}"

                conn.execute(
                    text(
                        f'ALTER TABLE "{table.name}" '
                        f'ADD COLUMN "{column.name}" {ddl}{default_sql}'
                    )
                )


def ensure_indexes():
    """Create indexes declared on the models but missing from the database.

    ``Base.metadata.create_all`` only looks at whether the *table* exists; if it
    does, the table is skipped wholesale and any index added to the model later
    is never created. So an `index=True` on an existing table reaches fresh
    databases only - which is how the foreign-key columns ended up unindexed
    everywhere but a clean install. `checkfirst` makes this a no-op once the
    index is there.
    """
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            for index in table.indexes:
                index.create(bind=conn, checkfirst=True)


def encrypt_legacy_api_keys():
    """One-shot upgrade of API keys stored before encryption existed.

    Moves any plaintext `providers.api_key` into the encrypted
    `api_key_enc` column and blanks the original. Safe to run repeatedly -
    rows already migrated have a NULL plaintext column and are skipped.
    """
    from sqlalchemy import text

    from app import crypto

    with engine.begin() as conn:
        rows = conn.execute(
            text(
                "SELECT id, api_key FROM providers "
                "WHERE api_key IS NOT NULL AND api_key != ''"
            )
        ).fetchall()

        for row_id, plaintext in rows:
            conn.execute(
                text(
                    "UPDATE providers SET api_key_enc = :enc, api_key = NULL "
                    "WHERE id = :id"
                ),
                {"enc": crypto.encrypt(plaintext), "id": row_id},
            )

    if rows:
        import logging

        logging.getLogger(__name__).warning(
            "Encrypted %d previously plaintext API key(s).", len(rows)
        )
