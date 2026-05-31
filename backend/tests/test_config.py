from app.config import Settings

def test_defaults_apply_when_env_absent():
    s = Settings(_env_file=None)
    assert s.guest_daily_limit == 3
    assert s.free_daily_limit == 10
    assert s.vision_model  # non-empty default

def test_env_overrides(monkeypatch):
    monkeypatch.setenv("NUTRISCAN_GUEST_DAILY_LIMIT", "5")
    s = Settings(_env_file=None)
    assert s.guest_daily_limit == 5
