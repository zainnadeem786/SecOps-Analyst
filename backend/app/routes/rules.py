from fastapi import APIRouter, Depends

from app.core.auth import ResolvedAuthContext, require_cookie_user
from app.core.config import Settings, get_settings
from app.models.log_model import RulesConfig
from app.services.rules_service import load_rules_config, save_rules_config

router = APIRouter()


@router.get("/rules", response_model=RulesConfig, summary="Get current detector rules")
async def get_rules(
    _: ResolvedAuthContext = Depends(require_cookie_user),
    settings: Settings = Depends(get_settings),
) -> RulesConfig:
    return load_rules_config(settings)


@router.put("/rules", response_model=RulesConfig, summary="Update detector rules")
async def update_rules(
    payload: RulesConfig,
    _: ResolvedAuthContext = Depends(require_cookie_user),
    settings: Settings = Depends(get_settings),
) -> RulesConfig:
    return save_rules_config(payload, settings)
