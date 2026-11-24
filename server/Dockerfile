# Bangun dari folder utama aplikasi:
#   docker build -f server/Dockerfile -t dianfarma .
FROM node:24-slim
WORKDIR /app
COPY server/server.js server/package.json ./server/
COPY frontend/apotek-dian-farma.html frontend/toko.html ./frontend/
ENV PORT=3100 DATA_DIR=/data FRONTEND_DIR=/app/frontend NODE_ENV=production
VOLUME /data
EXPOSE 3100
USER node
CMD ["node", "server/server.js"]
