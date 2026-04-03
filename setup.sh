#!/bin/bash
set -e

echo "=== Bar-Beurs setup voor Raspberry Pi 4 ==="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_IP="192.168.4.1"

# --- nvm + Node.js 20 ---
echo "[1/9] Node.js 20 installeren via nvm..."
if [ ! -d "$HOME/.nvm" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi

export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 20
nvm use 20
nvm alias default 20

# --- PostgreSQL + git ---
echo "[2/9] PostgreSQL, git en dnsmasq installeren..."
sudo apt-get update -y
sudo apt-get install -y postgresql git dnsmasq

# --- PostgreSQL gebruiker + database ---
echo "[3/9] PostgreSQL gebruiker en database aanmaken..."
sudo systemctl enable postgresql
sudo systemctl start postgresql

sudo -u postgres psql -c "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD '442764';
  ELSE
    ALTER ROLE postgres WITH PASSWORD '442764';
  END IF;
END \$\$;"

sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname = 'bar_management'" \
  | grep -q 1 || sudo -u postgres createdb -O postgres bar_management

echo "PostgreSQL klaar: user=postgres, db=bar_management"

# --- Netwerk: statisch IP op eth0 ---
echo "[4/9] Statisch IP instellen op eth0 ($PI_IP)..."
if ! grep -q "interface eth0" /etc/dhcpcd.conf 2>/dev/null; then
  sudo tee -a /etc/dhcpcd.conf > /dev/null << EOF

# Bar-Beurs statisch IP
interface eth0
static ip_address=${PI_IP}/24
EOF
  echo "      Toegevoegd aan /etc/dhcpcd.conf"
else
  echo "      /etc/dhcpcd.conf bevat al een eth0-blok, overgeslagen."
fi

# --- Netwerk: dnsmasq DHCP server ---
echo "[5/9] dnsmasq configureren als DHCP server..."
DNSMASQ_MARKER="# Bar-Beurs DHCP"
if ! grep -q "$DNSMASQ_MARKER" /etc/dnsmasq.conf 2>/dev/null; then
  sudo tee -a /etc/dnsmasq.conf > /dev/null << EOF

$DNSMASQ_MARKER
interface=eth0
dhcp-range=192.168.4.2,192.168.4.50,255.255.255.0,24h
EOF
  echo "      Toegevoegd aan /etc/dnsmasq.conf"
else
  echo "      /etc/dnsmasq.conf bevat al Bar-Beurs config, overgeslagen."
fi

sudo systemctl enable dnsmasq
sudo systemctl restart dnsmasq
echo "      dnsmasq gestart."

# --- .env bestanden bijwerken ---
echo "[6/9] .env bestanden bijwerken met IP $PI_IP..."
for app in bar-app bar-admin; do
  ENV_FILE="$SCRIPT_DIR/$app/.env"
  if [ -f "$ENV_FILE" ]; then
    sed -i "s|REACT_APP_API_URL=.*|REACT_APP_API_URL=http://${PI_IP}:5000|" "$ENV_FILE"
    sed -i "s|REACT_APP_WS_URL=.*|REACT_APP_WS_URL=ws://${PI_IP}:5001|" "$ENV_FILE"
    echo "      $app/.env bijgewerkt"
  else
    echo "      WAARSCHUWING: $ENV_FILE niet gevonden, overgeslagen."
  fi
done

# --- npm install in alle apps ---
echo "[7/9] npm install uitvoeren in alle apps..."

for app in bar-management bar-app bar-admin bar-visual; do
  echo "  -> $app"
  (cd "$SCRIPT_DIR/$app" && npm install)
done

# --- Seed de database ---
echo "[8/9] Database seeden (seed.js)..."
(cd "$SCRIPT_DIR/bar-management" && node seed.js)

# --- start-all.sh uitvoerbaar maken ---
echo "[9/9] start-all.sh uitvoerbaar maken..."
chmod +x "$SCRIPT_DIR/start-all.sh"

# --- Chromium kiosk autostart ---
echo "[Extra] Chromium kiosk autostart instellen op localhost:3004..."
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/barbeurs.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Name=Bar-Beurs Kiosk
Exec=chromium-browser --noerrdialogs --disable-infobars --kiosk http://localhost:3004
X-GNOME-Autostart-enabled=true
EOF

echo ""
echo "=============================================="
echo "  Bar-Beurs setup voltooid!"
echo "=============================================="
echo ""
echo "  Pi IP-adres  : $PI_IP"
echo "  Backend API  : http://${PI_IP}:5000"
echo "  Kassa        : http://${PI_IP}:3000"
echo "  Admin panel  : http://${PI_IP}:3001"
echo "  Gastscherm   : http://${PI_IP}:3004"
echo ""
echo "  DHCP range   : 192.168.4.2 – 192.168.4.50"
echo "  Sluit de GWN7610 aan op eth0 van de Pi."
echo ""
echo "  !! Een REBOOT is vereist om het statische IP"
echo "     en dnsmasq correct te activeren !!"
echo ""

read -r -p "Nu rebooten? [j/N] " REBOOT_ANSWER
case "$REBOOT_ANSWER" in
  [jJyY])
    echo "Rebooten..."
    sudo reboot
    ;;
  *)
    echo "Reboot uitgesteld. Voer 'sudo reboot' uit als je klaar bent."
    echo "Start daarna de apps met: ./start-all.sh"
    ;;
esac
