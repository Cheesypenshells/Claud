"""Aturan jam trading & manajemen risiko. Tanpa koneksi broker, mudah dites."""
import math
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

WIB = ZoneInfo("Asia/Jakarta")
LONDON = ZoneInfo("Europe/London")
CLOSE_ENTRIES = ("DEAL_ENTRY_OUT", "DEAL_ENTRY_OUT_BY", "DEAL_ENTRY_INOUT")


def fmt_wib(dt):
    return dt.astimezone(WIB).strftime("%Y-%m-%d %H:%M WIB")


def in_session(now_utc, start_hour, end_hour):
    london = now_utc.astimezone(LONDON)
    return london.weekday() < 5 and start_hour <= london.hour < end_hour


def _net(deal):
    return (deal.get("profit") or 0) + (deal.get("swap") or 0) + (deal.get("commission") or 0)


def _ours(deals, symbol, magic):
    return [d for d in deals if d.get("symbol") == symbol and d.get("magic") == magic]


def closed_trades(deals, symbol, magic):
    """Daftar (waktu, net P/L) posisi yang sudah ditutup, urut lama -> baru."""
    out = [(d["time"], _net(d)) for d in _ours(deals, symbol, magic) if d.get("entryType") in CLOSE_ENTRIES]
    return sorted(out, key=lambda x: x[0])


def today_net(deals, symbol, magic, now_utc):
    """Net P/L hari ini (hari WIB), termasuk komisi saat buka posisi."""
    day_start = now_utc.astimezone(WIB).replace(hour=0, minute=0, second=0, microsecond=0)
    return sum(_net(d) for d in _ours(deals, symbol, magic) if d["time"] >= day_start)


def pause_until(trades, max_losses, pause_hours):
    """Setiap `max_losses` kalah beruntun -> jeda `pause_hours` sejak kekalahan terakhir.
    Hitungan reset setelah jeda dimulai. Mengembalikan waktu akhir jeda terakhir (atau None)."""
    count, until = 0, None
    for t, net in trades:
        count = count + 1 if net < 0 else 0
        if count >= max_losses:
            until = t + timedelta(hours=pause_hours)
            count = 0
    return until


def allowed_risk(deals, symbol, magic, now_utc, risk_per_trade, daily_limit, max_losses, pause_hours):
    """(risiko $ yang boleh dipakai, alasan). Risiko 0 = dilarang trading."""
    until = pause_until(closed_trades(deals, symbol, magic), max_losses, pause_hours)
    if until and now_utc < until:
        return 0.0, f"jeda setelah {max_losses}x kalah beruntun, sampai {fmt_wib(until)}"
    loss_today = max(0.0, -today_net(deals, symbol, magic, now_utc))
    remaining = daily_limit - loss_today
    if remaining <= 0.01:
        return 0.0, f"batas rugi harian ${daily_limit:.2f} tercapai (rugi hari ini ${loss_today:.2f})"
    return min(risk_per_trade, remaining), f"rugi hari ini ${loss_today:.2f}, sisa jatah ${remaining:.2f}"


def calc_lot(risk_usd, sl_distance, tick_size, loss_tick_value, min_vol, max_vol, step):
    """Lot terbesar yang rugi-di-SL <= risk_usd. 0 jika lot minimum pun terlalu besar."""
    if sl_distance <= 0 or tick_size <= 0 or loss_tick_value <= 0:
        return 0.0
    loss_per_lot = sl_distance / tick_size * loss_tick_value
    lot = math.floor(risk_usd / loss_per_lot / step + 1e-9) * step
    lot = min(lot, max_vol)
    decimals = max(0, -int(math.floor(math.log10(step))))
    lot = round(lot, decimals)
    return lot if lot >= min_vol else 0.0
