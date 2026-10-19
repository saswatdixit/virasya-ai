FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app/src

RUN apt-get update \
    && apt-get install --no-install-recommends --yes ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.lock requirements-punctuation.lock ./
RUN python -m venv "$VIRTUAL_ENV" \
    && pip install --no-cache-dir --requirement requirements.lock \
    && pip install --no-cache-dir --requirement requirements-punctuation.lock

COPY . .

EXPOSE 5000

CMD ["python", "-m", "flask", "--app", "virasya_ai.workbench.app:app", "run", "--host", "0.0.0.0", "--port", "5000"]
