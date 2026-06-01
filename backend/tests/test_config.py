from app.config import Settings

def test_defaults_apply_when_env_absent():
    s = Settings(_env_file=None)
    assert s.guest_daily_limit == 3
    assert s.free_daily_limit == 10
    assert s.vision_model  # non-empty default

def test_env_overrides(monkeypatch):
    monkeypatch.setenv("PARAKH_GUEST_DAILY_LIMIT", "5")
    s = Settings(_env_file=None)
    assert s.guest_daily_limit == 5


def test_secret_key_is_separate_from_openrouter_key(monkeypatch):
    # The token-signing secret must be its own setting, never the OpenRouter API key,
    # so rotating the API key doesn't invalidate tokens and the key isn't a signing oracle.
    monkeypatch.setenv("PARAKH_SECRET_KEY", "sign-with-this")
    monkeypatch.setenv("PARAKH_OPENROUTER_API_KEY", "sk-or-different")
    s = Settings(_env_file=None)
    assert s.secret_key == "sign-with-this"
    assert s.secret_key != s.openrouter_api_key


def test_google_client_id_defaults_empty():
    assert Settings(_env_file=None).google_client_id == ""


def test_google_client_id_reads_env(monkeypatch):
    monkeypatch.setenv("PARAKH_GOOGLE_CLIENT_ID", "abc.apps.googleusercontent.com")
    s = Settings(_env_file=None)
    assert s.google_client_id == "abc.apps.googleusercontent.com"
