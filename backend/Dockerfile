FROM node:20-alpine

WORKDIR /app

# Install dependencies first so this layer caches across source edits.
# `npm ci` needs package-lock.json, which is committed.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY db ./db

EXPOSE 4000

# Run as the unprivileged user that the node image already provides.
USER node

CMD ["node", "src/server.js"]
