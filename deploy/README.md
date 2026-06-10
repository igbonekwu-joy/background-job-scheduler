# Deploying queuectl to a VPS

## Architecture

```
Browser → Nginx (:443)
            ├── /          → /var/www/queuectl/client/dist
            └── /api/*     → Node API (:5000)
PM2
  ├── queuectl-api     (server.js)
  └── queuectl-worker  (worker)
PostgreSQL (local or managed)
```

The client is built with `VITE_API_BASE_URL=` (empty) so API calls use same-origin `/api/...`.

## One-time VPS setup

```bash
# Node 20, PostgreSQL, Nginx, PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs postgresql nginx
sudo npm install -g pm2

# App directory
sudo mkdir -p /var/www/queuectl
sudo chown -R $USER:$USER /var/www/queuectl

# Database
sudo -u postgres createdb job_scheduler

# Server env (never commit this file)
nano /var/www/queuectl/server/.env
```

Example `server/.env`:

```env
PORT=5000
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@localhost:5432/job_scheduler
CLIENT_ORIGIN=https://your-domain.com
DLQ_ALERT_THRESHOLD=10
DLQ_ALERT_EMAIL=you@example.com
```

```bash
# Nginx
sudo cp /var/www/queuectl/deploy/nginx.conf.example /etc/nginx/sites-available/queuectl
# edit server_name, then:
sudo ln -s /etc/nginx/sites-available/queuectl /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# PM2 on boot
pm2 startup
```

## GitHub Actions secrets

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | VPS IP or domain |
| `VPS_USER` | SSH user (e.g. `deploy`) |
| `VPS_SSH_KEY` | Private SSH key (ed25519) |
| `VPS_PORT` | Optional, default `22` |

Add under **Settings → Secrets and variables → Actions**.

## What runs on deploy

1. **CI** (`ci.yml`) — lint + build on every PR and push to `main`
2. **Deploy** (`deploy.yml`) — on push to `main` (or manual trigger):
   - Builds client
   - Packages `client/dist`, `server/`, `deploy/`
   - Uploads tarball to VPS
   - Runs `deploy/deploy.sh`: `npm ci`, migrations, `pm2 reload`

## Manual deploy (without GitHub)

```bash
# From repo root on your machine
cd client && npm ci && VITE_API_BASE_URL= npm run build && cd ..
rsync -avz --exclude node_modules --exclude .env server/ user@vps:/var/www/queuectl/server/
rsync -avz client/dist/ user@vps:/var/www/queuectl/client/dist/
rsync -avz deploy/ user@vps:/var/www/queuectl/deploy/
ssh user@vps 'bash /var/www/queuectl/deploy/deploy.sh'
```
