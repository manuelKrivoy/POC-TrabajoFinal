# Imagen minimalista de Node para empaquetar la API y el frontend estatico.
FROM node:20-alpine

# Carpeta de trabajo dentro del contenedor.
WORKDIR /app

# Instala dependencias antes de copiar el resto para aprovechar cache de Docker.
COPY package*.json ./
RUN npm install --omit=dev

# Copia codigo fuente, public/, data de ejemplo y configuracion.
COPY . .

# Defaults del contenedor. docker-compose.yml puede sobreescribirlos, especialmente CODELLAMA_BASE_URL.
ENV NODE_ENV=production
ENV PORT=3000
ENV CLASSIFICATION_LLM_PROVIDER=codellama
ENV CLASSIFICATION_LLM_TIMEOUT_MS=8000
ENV ASSIGNMENT_LLM_PROVIDER=codellama
ENV CODELLAMA_BASE_URL=http://localhost:11434
ENV CODELLAMA_MODEL=qwen2.5:0.5b-instruct
ENV ASSIGNMENT_LLM_TIMEOUT_MS=8000

EXPOSE 3000

# Ejecuta el entrypoint definido en package.json.
CMD ["npm", "start"]
