"""Semua setting robot. Ubah angka di sini, bukan di file lain."""
import os

SYMBOL = "EURUSD"
TIMEFRAME = "1h"
MAGIC = 20261118

# Strategi (breakout Donchian + filter tren EMA, ala Turtle Traders)
DONCHIAN_PERIOD = 20
EMA_PERIOD = 200
ATR_PERIOD = 14
ATR_SL_MULT = 2.0
REWARD_RISK = 2.0
MAX_SPREAD_POINTS = 20

# Jam buka posisi: waktu LONDON (otomatis ikut musim panas/dingin)
# 08:00-21:00 London = 15:00-04:00 WIB (musim dingin) / 14:00-03:00 WIB (musim panas)
SESSION_START_LONDON = 8
SESSION_END_LONDON = 21

# Manajemen risiko
RISK_PER_TRADE_USD = 15.0
DAILY_LOSS_LIMIT_USD = 25.0      # dihitung per hari WIB (00:00-24:00 WIB)
MAX_CONSEC_LOSSES = 3
PAUSE_HOURS = 24

# Keamanan
ALLOW_REAL_ACCOUNT = os.environ.get("ALLOW_REAL_ACCOUNT", "false").lower() == "true"
DRY_RUN = os.environ.get("DRY_RUN", "true").lower() != "false"   # default: hanya simulasi
