# =============================
# 1️⃣ Base Image
# =============================
FROM node:20-slim

# Install required system packages for Puppeteer/Chromium
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates fonts-liberation \
    libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libcups2 libdbus-1-3 libgdk-pixbuf2.0-0 libnspr4 libnss3 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
    libgbm1 libxkbcommon0 xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# =============================
# 2️⃣ Set working directory
# =============================
WORKDIR /usr/src/app

# =============================
# 3️⃣ Copy dependencies first (for caching)
# =============================
COPY package*.json ./

# Install dependencies (including puppeteer-extra)
RUN npm ci

# =============================


# 4️⃣ Copy all source code
# =============================
COPY . .

# =============================
# 5️⃣ Expose server port
# =============================
EXPOSE 3000

# =============================
# 6️⃣ Default command
# =============================
CMD ["npm", "run", "start","dev"]
