# ─────────────────────────────────────────────────────────────
# UptimeRobot — Keep Render Free Tier Alive
# ─────────────────────────────────────────────────────────────
# Configure UptimeRobot to ping your health endpoint every 5 minutes
# This prevents Render from spinning down your free instance
#
# Setup:
# 1. Acesse: https://uptimerobot.com (gratuito)
# 2. Crie uma conta
# 3. Clique em "Add New Monitor"
# 4. Configure:
#    - Monitor Type: HTTP(s)
#    - Friendly Name: Enterprise System
#    - URL: https://enterprise-system.onrender.com/api/v1/health
#    - Monitoring Interval: 5 minutes
# 5. Salve!
# ─────────────────────────────────────────────────────────────

# Health endpoint to ping:
# https://enterprise-system.onrender.com/api/v1/health

# Expected response (200 OK):
# {
#   "status": "ok",
#   "timestamp": "2026-07-30T...",
#   "uptime": 123.456
# }
