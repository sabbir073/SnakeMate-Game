# VPS

Target: Ubuntu 24.04 LTS, 4–8 vCPU, 8–16 GB RAM, NVMe (spec §62). All steps
from a fresh instance to live game (spec §143):

```bash
# 1. base hardening
adduser deploy && usermod -aG sudo deploy       # no root operation
apt update && apt -y upgrade
apt -y install ufw git curl

# 2. firewall (spec §66) — ONLY 22/80/443 public
ufw default deny incoming
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw enable

# 3. docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

# 4. app
git clone https://github.com/sabbir073/SnakeMate-Game.git /opt/nibblio
cd /opt/nibblio
cp .env.example .env
#   edit .env: SITE_ADDRESS=yourdomain.com, POSTGRES_PASSWORD=$(openssl rand -hex 24),
#              SESSION_SECRET=$(openssl rand -hex 32)

# 5. DNS (at your registrar) — BEFORE first start so TLS issuance succeeds
#    A     yourdomain.com      → <VPS IPv4>
#    AAAA  yourdomain.com      → <VPS IPv6, if any>
#    (optional) CNAME www → yourdomain.com

# 6. launch — Caddy obtains Let's Encrypt automatically (spec §67)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 7. verify
curl -sf https://yourdomain.com/health
curl -sf https://yourdomain.com/version
#    open https://yourdomain.com in two browsers on different networks → play

# 8. operations
crontab -e   # add:
#   0 4 * * *   cd /opt/nibblio && ./scripts/backup-db.sh >> /var/log/nibblio-backup.log 2>&1
#   */5 * * * * cd /opt/nibblio && BASE_URL=https://yourdomain.com ./scripts/healthwatch.sh || logger -t nibblio "healthwatch FAILED"
```

Notes: postgres/redis/2567 are never published (compose `expose` only);
TLS renewal is automatic (Caddy); host log rotation is handled by the compose
json-file limits; keep the OS patched monthly (spec §126) with
`apt update && apt upgrade` + `docker compose pull`.
