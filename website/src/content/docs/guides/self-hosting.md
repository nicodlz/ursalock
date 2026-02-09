---
title: Self-Hosting
description: Deploy your own zod-vault server
---

zod-vault server is a single binary with SQLite storage. No external databases required.

## Quick Start

### Docker

```bash
docker run -d \
  --name zod-vault \
  -p 3000:3000 \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -v vault-data:/app/data \
  ghcr.io/nicodlz/zod-vault-server
```

### Docker Compose

```yaml
version: "3.8"

services:
  zod-vault:
    image: ghcr.io/nicodlz/zod-vault-server
    ports:
      - "3000:3000"
    environment:
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - vault-data:/app/data
    restart: unless-stopped

volumes:
  vault-data:
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Secret for signing JWTs (32+ chars) |
| `JWT_ISSUER` | No | `zod-vault` | JWT issuer claim |
| `JWT_ACCESS_EXPIRY` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | No | `7d` | Refresh token lifetime |
| `DB_PATH` | No | `./data/vault.db` | SQLite database path |
| `PORT` | No | `3000` | HTTP port |

### Generating a JWT Secret

```bash
openssl rand -hex 32
```

## Platform Guides

### Coolify

1. Create new Application → Docker Image
2. Image: `ghcr.io/nicodlz/zod-vault-server`
3. Add environment variable: `JWT_SECRET`
4. Add persistent storage: `/app/data`
5. Deploy

### Railway

1. New Project → Deploy from GitHub
2. Select `packages/server` as root
3. Add `JWT_SECRET` environment variable
4. Deploy

### Fly.io

```toml
# fly.toml
app = "my-zod-vault"

[build]
  dockerfile = "packages/server/Dockerfile"

[env]
  PORT = "8080"

[mounts]
  source = "vault_data"
  destination = "/app/data"
```

```bash
fly secrets set JWT_SECRET="$(openssl rand -hex 32)"
fly deploy
```

### VPS (Ubuntu)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and build
git clone https://github.com/nicodlz/zod-vault.git
cd zod-vault/packages/server
npm install && npm run build

# Create systemd service
sudo tee /etc/systemd/system/zod-vault.service << EOF
[Unit]
Description=zod-vault server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/zod-vault/packages/server
Environment=JWT_SECRET=your-secret-here
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now zod-vault
```

## Reverse Proxy

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name vault.example.com;

    ssl_certificate /etc/letsencrypt/live/vault.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vault.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy

```
vault.example.com {
    reverse_proxy localhost:3000
}
```

## Backups

SQLite database is a single file:

```bash
# While server is running (safe)
sqlite3 /app/data/vault.db ".backup /backups/vault-$(date +%Y%m%d).db"
```

## Health Check

```bash
curl https://vault.example.com/health
# => {"status":"ok","timestamp":1234567890}
```

## Security Checklist

- [ ] HTTPS in production
- [ ] Strong JWT_SECRET (32+ random bytes)
- [ ] Run as non-root user
- [ ] Firewall (only expose 443)
- [ ] Regular backups
- [ ] Keep server updated
