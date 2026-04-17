FROM python:3.11-slim

WORKDIR /app

# Only install runtime system dependencies for OpenCV and MediaPipe
# Removing cmake, make, and g++ prevents heavy compilation during build
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Matches the entry point defined in your main.py
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]