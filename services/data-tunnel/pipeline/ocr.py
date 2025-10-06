import io
import logging

import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)


def run_ocr(image_bytes: bytes, lang: str = "eng") -> dict:
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            text = pytesseract.image_to_string(img, lang=lang)
            return {"text": text, "confidence": 0.6}
    except Exception as exc:
        logger.warning("OCR stub fallback due to error: %s", exc)
        return {"text": "", "confidence": 0.0}
