from sqlalchemy import select
from app.models import DailyScan


class RateLimiter:
    """Tracks and enforces per-identity daily scan allowances in SQLite.
    `day` is injected (ISO 'YYYY-MM-DD') so behavior is deterministic and testable."""

    def __init__(self, session_factory, guest_limit: int, free_limit: int):
        self._Session = session_factory
        self._limits = {"guest": guest_limit, "free": free_limit}

    def _limit_for(self, tier: str) -> int:
        return self._limits.get(tier, self._limits["guest"])

    def check_and_consume(self, identity: str, tier: str, day: str) -> dict:
        limit = self._limit_for(tier)
        with self._Session() as s:
            row = s.scalar(
                select(DailyScan).where(
                    DailyScan.identity == identity, DailyScan.day == day))
            current = row.count if row else 0
            if current >= limit:
                return {"allowed": False, "remaining": 0, "limit": limit}
            if row is None:
                row = DailyScan(identity=identity, day=day, count=0)
                s.add(row)
            row.count = current + 1
            s.commit()
            return {"allowed": True, "remaining": limit - row.count, "limit": limit}

    def remaining(self, identity: str, tier: str, day: str) -> int:
        limit = self._limit_for(tier)
        with self._Session() as s:
            row = s.scalar(
                select(DailyScan).where(
                    DailyScan.identity == identity, DailyScan.day == day))
            return max(0, limit - (row.count if row else 0))
