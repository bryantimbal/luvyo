# LUVYO API + web app server. Works on any container host (Render, Fly.io, Railway, Cloud Run).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY core ./core
COPY apps ./apps
COPY data ./data
COPY scripts ./scripts
COPY supabase ./supabase
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
