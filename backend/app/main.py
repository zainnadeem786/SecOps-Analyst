import logging
from contextlib import asynccontextmanager
import asyncio
import sys

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.auth import IdentityMiddleware
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import ping_database
from app.routes.auth import router as auth_router
from app.routes.cases import router as cases_router
from app.routes.executive import router as executive_router
from app.routes.rules import router as rules_router
from app.routes.search import router as search_router
from app.routes.share import router as share_router
from app.routes.stream import router as stream_router
from app.routes.upload import router as upload_router

configure_logging()
settings = get_settings()
logger = logging.getLogger(__name__)

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("Starting %s in %s mode.", settings.app_name, settings.app_env)
    await ping_database(settings)
    yield
    logger.info("Shutting down %s.", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Upload access logs, detect suspicious activity, and enrich findings with Ollama.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(IdentityMiddleware, settings=settings)

app.include_router(auth_router)
app.include_router(upload_router)
app.include_router(cases_router)
app.include_router(rules_router)
app.include_router(search_router)
app.include_router(share_router)
app.include_router(executive_router)
app.include_router(stream_router)


@app.exception_handler(HTTPException)
async def handle_http_exception(_: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, dict) else {"detail": str(exc.detail)}
    return JSONResponse(
        status_code=exc.status_code,
        content=detail,
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_exception(_: Request, exc: RequestValidationError) -> JSONResponse:
    logger.warning("Validation error: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": "Invalid request payload."},
    )


@app.exception_handler(Exception)
async def handle_unexpected_exception(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled server error: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error."},
    )
