# Small Room

A minimal public chat room built with Express and WebSockets.

## Run locally for development

```bash
pnpm install
pnpm start
```

Open `http://localhost:3000`.

## Deploy with mechanical isolation from your computer

Use a third-party Node host that supports WebSockets. Render's free web service works with this repository.

Do not use a tunnel, port forward, reverse proxy, webhook listener, or any process on your computer. The running server should exist only on the hosting provider.

1. Push this folder to a GitHub repository.
2. In Render, create a new **Blueprint** or **Web Service** from the repository.
3. Render can use `render.yaml` automatically.
4. After deploy, open the Render URL and share it.

The chat history is in memory only, so it resets when the free service restarts.
