# Dockerfile
FROM node:18-alpine

WORKDIR /app

# package* fayllarni ko'chirib o'rnatamiz
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

# Ilova fayllari (egasi node bo'lsin)
COPY --chown=node:node . .

# uploads papkani yaratib, node'ga beramiz
RUN mkdir -p /app/uploads && chown -R node:node /app

USER node

EXPOSE 3000
CMD ["node", "server.js"]
