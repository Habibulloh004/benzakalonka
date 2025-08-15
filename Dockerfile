FROM node:18-alpine

ENV NODE_ENV=production
WORKDIR /app

# Faqat lock va package fayllarini ko'chirish
COPY package*.json ./

# Production deps
RUN npm install --omit=dev

# Kod
COPY . .

# Uploads papka (ruxsat bilan)
RUN mkdir -p uploads && chown -R node:node uploads

# Non-root user
USER node

EXPOSE 3000
CMD ["npm", "start"]
