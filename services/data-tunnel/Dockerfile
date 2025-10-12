FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-fra tesseract-ocr-ara ghostscript qpdf libjpeg-turbo-progs pngquant unpaper poppler-utils curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY services/data-tunnel/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
RUN pip install --no-cache-dir python-multipart==0.0.9
ARG SPACY_MODEL=en_core_web_sm-3.7.1
RUN python -m pip install --no-cache-dir \
    https://github.com/explosion/spacy-models/releases/download/${SPACY_MODEL}/${SPACY_MODEL}-py3-none-any.whl
COPY services/data-tunnel /app
ENV PORT=8000 HOST=0.0.0.0
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
