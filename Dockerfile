FROM node:14-alpine

RUN mkdir -p /usr/volumes/src /usr/volumes/share /usr/volumes/output
VOLUME ["/usr/volumes/src", "/usr/volumes/share", "/usr/volumes/output"]

RUN apk update && apk upgrade && \
    apk add --no-cache bash git openssh


# ========= for Puppeteer =========

# Installs latest Chromium (76) package.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      freetype-dev \
      harfbuzz \
      ca-certificates \
      ttf-freefont

# =================================

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

ENV IN_DOCKER true

# ========
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# ONBUILD ARG NODE_ENV
# ONBUILD ENV NODE_ENV $NODE_ENV
# ONBUILD COPY package.json /usr/src/app/
# ONBUILD RUN npm install && npm cache clean --force
# ONBUILD COPY . /usr/src/app
ARG NODE_ENV
ENV NODE_ENV $NODE_ENV
COPY package.json yar[n].lock package-loc[k].json /usr/src/app/
# RUN npm install && npm cache clean --force
# RUN apk add --no-cache --virtual .build-deps alpine-sdk python \
#  && npm install --production --silent \
#  && apk del .build-deps

# RUN apk add --no-cache --virtual .build-deps alpine-sdk python \
#  && npm install && npm cache clean --force \
#  && apk del .build-deps
RUN apk add --no-cache --virtual .build-deps alpine-sdk python3 \
 && yarn install && yarn cache clean \
 && apk del .build-deps
COPY . /usr/src/app
# ========

COPY docker-cmd.sh /usr/src/app/

# CMD [ "npm", "start" ]
