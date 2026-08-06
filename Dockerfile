# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 - build the React SPA
# ---------------------------------------------------------------------------
FROM node:22-alpine AS frontend

WORKDIR /build

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ---------------------------------------------------------------------------
# Stage 2 - Python runtime, serving both the API and the built SPA
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

# LibreOffice is what renders PPTX -> PDF before PyMuPDF rasterizes each slide.
# It is by far the largest thing in the image (~600MB on a ~250MB base), so
# it is opt-out: build with --build-arg WITH_LIBREOFFICE=false for a text-only
# image that skips the PPTX vision path.
ARG WITH_LIBREOFFICE=true

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATA_DIR=/data \
    DATABASE_URL=sqlite:////data/notes2anki.db \
    UPLOAD_DIR=/data/uploads \
    EXPORT_DIR=/data/exports \
    HISTORY_DIR=/data/history \
    SLIDES_DIR=/data/slides \
    STATIC_DIR=/app/static

WORKDIR /app

# No libgl1-mesa-glx here: it was an OpenCV dependency, this image has no
# OpenCV (PyMuPDF rasterizes without libGL), and Debian 12 dropped the package
# outright - so installing it failed the build on bookworm, which is what
# python:3.12-slim is. Don't "fix" it by swapping in libgl1; just leave it out.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libglib2.0-0 \
      fonts-dejavu-core \
      util-linux \
    && if [ "$WITH_LIBREOFFICE" = "true" ]; then \
         apt-get install -y --no-install-recommends libreoffice-impress; \
       fi \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# The SPA is served by FastAPI from STATIC_DIR - one process, one port.
COPY --from=frontend /build/dist ./static

# Run unprivileged. /data is a volume, so it is chowned at entrypoint time
# rather than baked in, since a bind-mounted host dir overrides image perms.
RUN useradd --uid 1000 --create-home --shell /bin/bash app \
    && mkdir -p /data \
    && chown -R app:app /app /data

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/api/health').status==200 else 1)"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
