FROM node:20-slim

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src ./src
COPY frontend ./frontend
COPY supabase ./supabase
COPY README.md FLATMATE_LEDGER_PRODUCT_SPEC.md ./

RUN npm install --omit=dev

EXPOSE 3001

ENV PORT=3001

CMD ["node", "src/api/server.js"]

