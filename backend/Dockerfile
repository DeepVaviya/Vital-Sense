FROM python:3.11-slim

WORKDIR /app

# Install system deps for OpenCV, MediaPipe, AND the build tools for dlib
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    make \
    g++ \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# This line will now succeed because cmake and g++ are installed
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]