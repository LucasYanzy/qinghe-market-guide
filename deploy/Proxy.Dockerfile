FROM traefik:v3.7.17
# Include distribution fixes released since the upstream image was built.
RUN apk upgrade --no-cache
