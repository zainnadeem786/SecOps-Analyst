from app.core.config import Settings


def test_settings_uses_legacy_ollama_base_url_as_fallback() -> None:
    settings = Settings(ollama_base_url="http://legacy-host:11434")

    assert settings.ollama_url == "http://legacy-host:11434"


def test_settings_prefers_ollama_url_over_legacy_value() -> None:
    settings = Settings(
        ollama_url="http://primary-host:11434",
        ollama_base_url="http://legacy-host:11434",
    )

    assert settings.ollama_url == "http://primary-host:11434"
