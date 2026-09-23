FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
RUN npm run seed
CMD ["node", "server.js"]
