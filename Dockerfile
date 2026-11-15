FROM python:3.11-slim

WORKDIR /app

# adb is optional and is not published in every Debian base, so it must never
# break the build. Node and npm are needed for the Fern CLI.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl git nodejs npm \
    && (apt-get install -y --no-install-recommends adb \
        || apt-get install -y --no-install-recommends android-tools-adb \
        || echo "adb unavailable in this base image; ADB simulators will report it missing") \
    && apt-get clean \
    && find /var/lib/apt/lists -type f -delete

RUN npm install -g fern-api

COPY . /app

RUN pip install --no-cache-dir fastapi uvicorn pydantic requests pytest

EXPOSE 8001

CMD ["python", "simulators/dashboard_server.py"]
