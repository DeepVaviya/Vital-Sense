# # FROM python:3.11-slim

# # WORKDIR /app

# # # Only install runtime system dependencies for OpenCV and MediaPipe
# # # Removing cmake, make, and g++ prevents heavy compilation during build
# # RUN apt-get update && apt-get install -y --no-install-recommends \
# #     libgl1 \
# #     libglib2.0-0 \
# #     libsm6 \
# #     libxext6 \
# #     libxrender-dev \
# #     && rm -rf /var/lib/apt/lists/*

# # COPY requirements.txt .

# # # Install dependencies
# # RUN pip install --no-cache-dir -r requirements.txt

# # COPY . .

# # EXPOSE 8000

# # # Matches the entry point defined in your main.py
# # CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]


# FROM python:3.11-slim

# WORKDIR /app

# # Only install runtime system dependencies
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     libgl1 \
#     libglib2.0-0 \
#     libsm6 \
#     libxext6 \
#     libxrender-dev \
#     && rm -rf /var/lib/apt/lists/*

# COPY requirements.txt .

# # 1. Install all standard deps AND the pre-built dlib-bin
# RUN pip install --no-cache-dir -r requirements.txt

# # 2. Force install face_recognition WITHOUT triggering the dlib source build
# RUN pip install --no-cache-dir --no-deps face_recognition>=1.3.0

# COPY . .

# EXPOSE 8000

# CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]


FROM python:3.11-slim

WORKDIR /app

# Added libgles2 for Mediapipe and ca-certificates for MongoDB SSL
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgles2 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# 1. Install all standard deps AND the pre-built dlib-bin
RUN pip install --no-cache-dir -r requirements.txt

# 2. Force install face_recognition WITHOUT triggering the dlib source build
RUN pip install --no-cache-dir --no-deps face_recognition>=1.3.0

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]