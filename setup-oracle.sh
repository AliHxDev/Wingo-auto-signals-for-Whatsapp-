#!/usr/bin/env bash
# ==============================================================================
# WinGo WhatsApp Prediction Bot - Oracle Cloud Always Free 1-Click Installer
# OS Support: Ubuntu 20.04 / 22.04 / 24.04 LTS (x86_64 or ARM64 Ampere)
# ==============================================================================

set -e

echo "=========================================================="
echo "🚀 Installing WinGo WhatsApp Bot on Oracle Cloud Always Free"
echo "=========================================================="

# 1. Update system packages
echo "📦 Updating system packages..."
sudo apt-get update -y
sudo apt-get install -y curl wget git build-essential ufw iptables-persistent netfilter-persistent

# 2. Install Node.js 20 LTS
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'.' -f1 | sed 's/v//') -lt 20 ]]; then
    echo "🟢 Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "✅ Node.js $(node -v) & npm $(npm -v) installed."

# 3. Install PM2 process manager
if ! command -v pm2 &> /dev/null; then
    echo "🟢 Installing PM2 globally..."
    sudo npm install -g pm2
fi

# 4. Prepare local persistent data storage (Oracle Self-Contained)
echo "📁 Setting up local persistent data storage (No PostgreSQL needed)..."
mkdir -p data
mkdir -p auth_info_baileys

# 5. Configure .env file
JWT_SECRET=$(openssl rand -hex 16)
ADMIN_PASS="admin123456"

if [ ! -f .env ]; then
    echo "📝 Creating .env configuration file..."
    cat <<EOF > .env
PORT=3000
NODE_ENV=production
USE_LOCAL_DB=true
DATABASE_URL=
DATABASE_SSL=false
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASS}
JWT_SECRET=${JWT_SECRET}
EOF
    echo "✅ .env created with Oracle Native Local Persistent Engine."
else
    echo "ℹ️  Existing .env found. Ensuring local persistent engine is enabled..."
    # If existing .env has postgres URL, set USE_LOCAL_DB=true to use local storage
    if grep -q "USE_LOCAL_DB" .env; then
        sed -i 's/USE_LOCAL_DB=.*/USE_LOCAL_DB=true/' .env
    else
        echo "USE_LOCAL_DB=true" >> .env
    fi
    sed -i 's/^DATABASE_URL=.*/DATABASE_URL=/' .env || true
fi

# 6. Oracle Cloud Firewall Configuration (Crucial for OCI!)
echo "🛡️ Opening Port 3000 in Oracle Cloud Ubuntu Firewall..."
sudo iptables -I INPUT 1 -p tcp --dport 3000 -j ACCEPT || true
sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT || true
sudo netfilter-persistent save || true

if command -v ufw &> /dev/null; then
    sudo ufw allow 22/tcp || true
    sudo ufw allow 3000/tcp || true
    sudo ufw allow 80/tcp || true
    sudo ufw --force enable || true
fi

# 7. Install dependencies & Build
echo "🔨 Installing application dependencies..."
npm install --legacy-peer-deps

echo "⚡ Building production frontend and server bundle..."
npm run build

# 8. Start with PM2 (24/7 background runner with auto-restart)
echo "🚀 Starting WinGo WhatsApp Bot with PM2..."
pm2 delete wingo-whatsapp-bot 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME || true

# Get public IP
PUBLIC_IP=$(curl -s https://ifconfig.me || curl -s https://api.ipify.org || echo "YOUR_INSTANCE_IP")

echo ""
echo "=========================================================="
echo "🎉 WinGo WhatsApp Bot is RUNNING 24/7 on Oracle Cloud!"
echo "=========================================================="
echo ""
echo "🌐 Access your Web Dashboard:"
echo "   http://${PUBLIC_IP}:3000"
echo ""
echo "🔑 Default Credentials:"
echo "   Username: admin"
echo "   Password: admin123456"
echo ""
echo "📋 Management Commands:"
echo "   pm2 status                    # View bot status"
echo "   pm2 logs wingo-whatsapp-bot   # View live real-time logs"
echo "   pm2 restart wingo-whatsapp-bot # Restart bot"
echo "   pm2 stop wingo-whatsapp-bot   # Stop bot"
echo ""
echo "⚠️  REMINDER FOR ORACLE CLOUD:"
echo "   Make sure you added an Ingress Rule for Port 3000 in your"
echo "   Oracle Cloud VCN Default Security List (TCP, Port 3000, 0.0.0.0/0)!"
echo "=========================================================="
