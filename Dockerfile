FROM node:14-alpine
WORKDIR /app
COPY . .

RUN yarn install --production

ENTRYPOINT ["node", "/app/lib/index.js"]
CMD ["/config.json", "/"]


