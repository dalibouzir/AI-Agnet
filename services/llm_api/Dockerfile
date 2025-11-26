FROM python:3.11-slim
ENV PIP_DEFAULT_TIMEOUT=180 \
    PIP_RETRIES=20 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY services/llm_api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY packages/py-shared /packages/py-shared
RUN pip install --no-cache-dir /packages/py-shared
COPY services/llm_api /app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
