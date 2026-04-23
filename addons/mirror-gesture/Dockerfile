ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base-python:3.11
FROM ${BUILD_FROM}

ENV LANG=C.UTF-8 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# OpenCV + MediaPipe need a few system libs.
RUN apk add --no-cache \
      ffmpeg \
      libstdc++ \
      libjpeg-turbo \
      mesa \
    || true

COPY requirements.txt /opt/requirements.txt
RUN pip install --no-cache-dir -r /opt/requirements.txt

WORKDIR /app
COPY run.sh /run.sh
COPY src /app/src
RUN chmod +x /run.sh

CMD [ "/run.sh" ]
