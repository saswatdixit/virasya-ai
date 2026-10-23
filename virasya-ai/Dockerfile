# Virasya AI — Speech Transcription & Preservation Backend
FROM python:3.11-slim

# System dependencies:
# - ffmpeg: required for audio decoding, container inspection, and duration validation
# - libsndfile1: required by python soundfile / libsndfile bindings
# - ca-certificates: required for outbound HTTPS TLS connections to https://api.vachana.ai
# - curl: required for Docker container health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upgrade pip and install package dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

# Copy source tree
COPY src/ /app/src/

# Create ephemeral scratch directories for audio processing
RUN mkdir -p /app/data/input /app/data/output

# Default production environment configuration
ENV PYTHONUNBUFFERED=1 \
    VIRASYA_WEB_HOST=0.0.0.0 \
    VIRASYA_DATA_DIR=/app/data

# Default port exposure (can be overridden by cloud platform PORT env variable)
EXPOSE 5000

# Verified health check endpoint (responds with 200 OK without leaking secrets)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f "http://localhost:${PORT:-5000}/api/health" || exit 1

# Production startup command using the supported package entry point
CMD ["python", "-m", "virasya_ai.web.server"]
