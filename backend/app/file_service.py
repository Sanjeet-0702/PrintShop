import io
import re
from pathlib import Path
from uuid import uuid4

import fitz  # PyMuPDF
from PIL import Image


UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


ALLOWED_EXTENSIONS = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
}

# Stored names are always: 32 random hex characters + extension.
_STORED_NAME = re.compile(r"[0-9a-f]{32}\.(pdf|jpg|jpeg|png)")


def save_uploaded_file(file_bytes: bytes, original_filename: str) -> dict:
    """
    Save an uploaded PDF/image and return basic information.
    """

    extension = Path(original_filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError(
            "Unsupported file type. Allowed: PDF, JPG, JPEG, PNG"
        )

    # Generate a unique filename so customer files never overwrite each other.
    unique_name = f"{uuid4().hex}{extension}"

    file_path = UPLOAD_DIR / unique_name

    file_path.write_bytes(file_bytes)

    if extension == ".pdf":
        try:
            page_count = get_pdf_page_count(file_path)
        except ValueError:
            # Do not keep an unreadable file on the server.
            if file_path.exists():
                file_path.unlink()
            raise

        file_type = "pdf"

    else:
        validate_image(file_path)
        page_count = 1
        file_type = "image"

    return {
        "original_filename": original_filename,
        "stored_filename": unique_name,
        "file_path": str(file_path),
        "file_type": file_type,
        "pages": page_count,
    }


def resolve_stored_file(stored_filename: str) -> dict:
    """
    Find an uploaded file from its stored name ONLY.

    The browser never tells the server a file path. The server checks the
    name format, looks the file up inside the uploads folder itself, and
    counts the pages again. Nothing about the file is trusted from the client.
    """

    if not _STORED_NAME.fullmatch(stored_filename or ""):
        raise ValueError("Invalid file reference.")

    file_path = UPLOAD_DIR / stored_filename

    if not file_path.is_file():
        raise ValueError(
            "Uploaded file was not found. Please upload it again."
        )

    if file_path.suffix.lower() == ".pdf":
        pages = get_pdf_page_count(file_path)
        file_type = "pdf"

    else:
        pages = 1
        file_type = "image"

    return {
        "stored_filename": stored_filename,
        "file_path": str(file_path),
        "file_type": file_type,
        "pages": pages,
    }


def get_pdf_page_count(file_path: Path) -> int:
    """
    Count pages in a PDF using PyMuPDF.
    """

    try:
        document = fitz.open(file_path)
        page_count = document.page_count
        document.close()

    except Exception as error:
        raise ValueError(
            f"Could not read PDF: {error}"
        )

    if page_count < 1:
        raise ValueError("The PDF contains no pages.")

    return page_count


def validate_image(file_path: Path) -> None:
    """
    Verify that the uploaded file is a valid image.
    """

    try:
        with Image.open(file_path) as image:
            image.verify()

    except Exception:
        # Delete invalid uploaded file.
        if file_path.exists():
            file_path.unlink()

        raise ValueError(
            "The uploaded image is invalid or corrupted."
        )

def render_page_preview(stored_filename: str, page_number: int = 1, dpi: int = 150) -> tuple[bytes, str]:
    """
    Renders any uploaded document page (PDF or image) to a high-quality PNG preview.
    Returns (image_bytes, "image/png").
    """
    file_info = resolve_stored_file(stored_filename)
    path = Path(file_info["file_path"])

    if file_info["file_type"] == "pdf":
        doc = fitz.open(path)
        try:
            total_pages = doc.page_count
            if page_number < 1 or page_number > total_pages:
                page_number = 1
            page = doc.load_page(page_number - 1)
            safe_dpi = max(50, min(300, int(dpi)))
            zoom = safe_dpi / 72.0
            matrix = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            return pix.tobytes("png"), "image/png"
        finally:
            doc.close()
    else:
        with Image.open(path) as img:
            max_size = (1600, 1600)
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            img.convert("RGB").save(buf, format="PNG")
            return buf.getvalue(), "image/png"
