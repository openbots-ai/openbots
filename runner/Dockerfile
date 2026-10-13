# The OpenBots agent, for running on a VM or server. iMessage itself needs a Mac, so in Docker the agent uses the
# relay transport: a small relay on your Mac posts texts here and sends the replies.
# Build from the repo root:  docker build -f runner/Dockerfile -t openbots-runner .

FROM node:24-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY convex ./convex
COPY runner ./runner
RUN node runner/build.mjs

FROM node:24-slim
WORKDIR /app
COPY runner/package.json runner/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /src/runner/dist ./dist
# History and the key that encrypts it live in /data: mount a volume and back it up
RUN mkdir /data && chown node:node /data
VOLUME /data
ENV OPENBOTS_TRANSPORT=relay OPENBOTS_RELAY_HOST=0.0.0.0 OPENBOTS_DATA_DIR=/data
EXPOSE 8787
USER node
CMD ["node", "dist/main.mjs"]
