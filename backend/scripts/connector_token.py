"""Issue (or rotate) a user's Claude connector URL. Prints it once; only a hash is
stored, and issuing a new one retires the old URL.

    docker exec -w /app -e PYTHONPATH=/app parakh-backend \\
        python -m scripts.connector_token --identity user:1
"""
import argparse

from app.config import get_settings
from app.connector import issue_token
from app.db import init_db, make_engine, make_session_factory

PUBLIC = "https://parakh-api.skdev.one"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--identity", required=True, help="e.g. user:1")
    args = ap.parse_args()
    engine = make_engine(get_settings().db_url)
    init_db(engine)   # creates connector_tokens on first use
    raw = issue_token(make_session_factory(engine), args.identity)
    print(f"{PUBLIC}/mcp/{raw}/mcp")


if __name__ == "__main__":
    main()
