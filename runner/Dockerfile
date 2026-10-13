# The OpenBots agent, for running on a VM or server. In Docker it texts through Twilio, Sendblue, BlueBubbles (on
# your Mac) or a relay; Messages on a Mac needs the agent on that Mac instead.
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
ENV OPENBOTS_MAC=false OPENBOTS_HOST=0.0.0.0 OPENBOTS_DATA_DIR=/data
EXPOSE 8787
USER node
CMD ["node", "dist/main.mjs"]
