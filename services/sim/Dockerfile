FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY services/sim/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY packages/py-shared /packages/py-shared
RUN pip install --no-cache-dir /packages/py-shared
COPY services/sim /app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
