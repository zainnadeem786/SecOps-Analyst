from __future__ import annotations

import json
from pathlib import Path

from app.core.config import Settings, get_settings
from app.models.log_model import RulesConfig


def resolve_rules_path(settings: Settings | None = None) -> Path:
    configured = (settings or get_settings()).rules_file_path
    path = Path(configured)
    if path.is_absolute():
        return path
    return Path(__file__).resolve().parents[2] / path


def load_rules_config(settings: Settings | None = None) -> RulesConfig:
    path = resolve_rules_path(settings)
    payload = json.loads(path.read_text(encoding="utf-8"))
    return RulesConfig.model_validate(payload)


def save_rules_config(config: RulesConfig, settings: Settings | None = None) -> RulesConfig:
    path = resolve_rules_path(settings)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    temp_path.write_text(config.model_dump_json(indent=2), encoding="utf-8")
    temp_path.replace(path)
    return config
