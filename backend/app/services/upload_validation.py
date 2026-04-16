from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import Settings

SUPPORTED_EXTENSIONS = {".log", ".txt"}


async def read_uploaded_text(file: UploadFile | None, settings: Settings) -> tuple[str, str]:
    if file is None or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A .log or .txt file is required.",
        )

    file_extension = Path(file.filename).suffix.lower()
    if file_extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .log and .txt files are supported.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    if len(content) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Uploaded file exceeds the 10 MB limit.",
        )

    return file.filename, content.decode("utf-8", errors="replace")
