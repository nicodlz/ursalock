# Self-Hosting

ursalock server is a single binary with SQLite storage. No external databases required.

## Quick Start

### Docker

```bash
docker run -d \
  --name ursalock \
  -p 3000:3000 \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -v vault-data:/app/data \
  ghcr.io/nicodlz/ursalock-server
```

### Docker Compose

```yaml
version: "3.8"

services:
  ursalock:
    image: ghcr.io/nicodlz/ursalock-server
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

### From Source

```bash
git clone https://github.com/nicodlz/ursalock.git
cd ursalock/packages/server
npm install
npm run build

JWT_SECRET="your-secret" npm start
```

## Configuration

All configuration is via environment variables.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Secret key for JWT signing (min 32 chars) |
| `JWT_ISSUER` | No | `ursalock` | JWT issuer claim |
| `JWT_ACCESS_EXPIRY` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | No | `7d` | Refresh token lifetime |
| `DB_PATH` | No | `./data/vault.db` | SQLite database path |
| `PORT` | No | `3000` | HTTP port |

### Generating a JWT Secret

```bash
# Linux/macOS
openssl rand -hex 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deployment Guides

### Coolify

1. Create new Application → Docker Image
2. Image: `ghcr.io/nicodlz/ursalock-server`
3. Add environment variable: `JWT_SECRET`
4. Add persistent storage: `/app/data`
5. Deploy

### Railway

1. New Project → Deploy from GitHub repo
2. Select `packages/server` as root directory
3. Add environment variable: `JWT_SECRET`
4. Railway handles the rest

### Fly.io

```toml
# fly.toml
app = "my-ursalock"

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
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and build
git clone https://github.com/nicodlz/ursalock.git
cd ursalock/packages/server
npm install
npm run build

# Create systemd service
sudo cat > /etc/systemd/system/ursalock.service << EOF
[Unit]
Description=ursalock server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/ursalock/packages/server
Environment=JWT_SECRET=your-secret-here
Environment=DB_PATH=/var/lib/ursalock/vault.db
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# Start
sudo systemctl enable ursalock
sudo systemctl start ursalock
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

The SQLite database is a single file. Back it up regularly:

```bash
# Simple copy (stop server first for consistency)
cp /app/data/vault.db /backups/vault-$(date +%Y%m%d).db

# Or use SQLite backup (works while running)
sqlite3 /app/data/vault.db ".backup /backups/vault-$(date +%Y%m%d).db"
```

## Security Checklist

- [ ] Use HTTPS in production (TLS termination at reverse proxy)
- [ ] Set a strong JWT_SECRET (32+ random bytes)
- [ ] Run as non-root user
- [ ] Firewall: only expose port 443
- [ ] Regular backups of SQLite database
- [ ] Keep server updated

## Monitoring

The server exposes a health endpoint:

```bash
curl https://vault.example.com/health
# => {"status":"ok","timestamp":1234567890}
```

Use this for uptime monitoring (Uptime Kuma, Pingdom, etc).
