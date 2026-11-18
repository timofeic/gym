"""The LiveKit Cloud build uploads this folder, so secrets must never go with it."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_dockerignore_keeps_secrets_and_venv_out() -> None:
    lines = {line.strip() for line in (ROOT / ".dockerignore").read_text().splitlines()}
    assert ".env" in lines
    assert ".env.*" in lines
    assert ".venv/" in lines


def test_service_role_key_is_not_an_agent_setting() -> None:
    # The deployed agent acts as the signed-in user. Only the test script uses the
    # service role key, and it reads it from the web app's env file.
    example = (ROOT / ".env.example").read_text()
    assert "SERVICE_ROLE" not in example
    for path in (ROOT / "gym_agent").glob("*.py"):
        assert "SERVICE_ROLE" not in path.read_text(), path.name
