FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata \
    OCR_LANGS=eng+fra \
    PARSERS=pdf,docx,txt,csv,pptx,xlsx,image,json

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libmagic1 \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    libjpeg62-turbo-dev \
    libpng-dev \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-fra \
    ocrmypdf \
    ghostscript \
    qpdf && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY services/data-tunnel/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/data-tunnel /app

# Celery workers run in a separate container defined in docker-compose.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
