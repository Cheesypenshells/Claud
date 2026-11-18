"""Satu kali jalan: cek akun, cek aturan, buka posisi kalau ada sinyal.
Dijalankan GitHub Actions setiap jam. Jalankan manual: python -m robot.main"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

from metaapi_cloud_sdk import MetaApi

from robot import config as C
from robot.risk import allowed_risk, calc_lot, fmt_wib, in_session
from robot.strategy import compute_signal

LOG = []


def log(msg):
    line = f"[{fmt_wib(datetime.now(timezone.utc))}] {msg}"
    print(line, flush=True)
    LOG.append(line)


def write_summary():
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a") as f:
            f.write("### Robot EURUSD\n\n" + "\n".join(f"- {l}" for l in LOG) + "\n")


async def trade_once(account, conn):
    now = datetime.now(timezone.utc)
    info = await conn.get_account_information()
    log(f"Akun {info['login']} ({info['server']}), saldo {info['balance']:.2f} {info['currency']}, "
        f"equity {info['equity']:.2f}")
    if info["type"] != "ACCOUNT_TRADE_MODE_DEMO" and not C.ALLOW_REAL_ACCOUNT:
        log("STOP: ini bukan akun DEMO. Robot hanya boleh di demo (ALLOW_REAL_ACCOUNT=false).")
        return
    if C.DRY_RUN:
        log("Mode SIMULASI (DRY_RUN): robot hanya mencatat keputusan, tidak membuka posisi.")

    # 1) Pengaman: posisi robot tanpa SL langsung ditutup
    positions = [p for p in await conn.get_positions()
                 if p["symbol"] == C.SYMBOL and p.get("magic") == C.MAGIC]
    for p in positions:
        if not p.get("stopLoss"):
            log(f"Posisi {p['id']} TANPA stop loss -> ditutup demi keamanan")
            if not C.DRY_RUN:
                await conn.close_position(str(p["id"]))
    if positions:
        p = positions[0]
        log(f"Masih ada posisi {p['type']} {p['volume']} lot, profit {p['profit']:.2f}. Tidak buka posisi baru.")
        return

    # 2) Jam trading
    if not in_session(now, C.SESSION_START_LONDON, C.SESSION_END_LONDON):
        log("Di luar sesi London/New York. Tidak buka posisi.")
        return

    # 3) Aturan risiko
    deals = (await conn.get_deals_by_time_range(now - timedelta(days=14), now))["deals"]
    risk_usd, reason = allowed_risk(deals, C.SYMBOL, C.MAGIC, now, C.RISK_PER_TRADE_USD,
                                    C.DAILY_LOSS_LIMIT_USD, C.MAX_CONSEC_LOSSES, C.PAUSE_HOURS)
    log(f"Risiko: {reason}")
    if risk_usd <= 0:
        log("Tidak trading.")
        return

    # 4) Sinyal dari candle H1 yang sudah tutup
    candles = await account.get_historical_candles(C.SYMBOL, C.TIMEFRAME, None, 400)
    candles = sorted(candles, key=lambda c: c["time"])
    candles = [c for c in candles if c["time"] + timedelta(hours=1) <= now]
    sig = compute_signal(candles, C.DONCHIAN_PERIOD, C.EMA_PERIOD, C.ATR_PERIOD, C.ATR_SL_MULT)
    if not sig:
        log(f"Tidak ada sinyal (close terakhir {candles[-1]['close']:.5f}).")
        return
    log(f"SINYAL {'BUY' if sig.direction > 0 else 'SELL'}: {sig.reason}")

    # 5) Hitung SL, TP, lot
    spec = await conn.get_symbol_specification(C.SYMBOL)
    price = await conn.get_symbol_price(C.SYMBOL)
    spread_pts = (price["ask"] - price["bid"]) / spec["point"]
    if spread_pts > C.MAX_SPREAD_POINTS:
        log(f"Spread {spread_pts:.0f} points terlalu lebar. Lewati.")
        return
    sl_dist = max(sig.sl_distance, (spec.get("stopsLevel") or 0) * spec["point"])
    entry = price["ask"] if sig.direction > 0 else price["bid"]
    sl = round(entry - sig.direction * sl_dist, spec["digits"])
    tp = round(entry + sig.direction * sl_dist * C.REWARD_RISK, spec["digits"])
    lot = calc_lot(risk_usd, abs(entry - sl), spec["tickSize"], price["lossTickValue"],
                   spec["minVolume"], spec["maxVolume"], spec["volumeStep"])
    if lot <= 0:
        log(f"Lewati: lot minimum pun berisiko > ${risk_usd:.2f} (jarak SL {sl_dist / 0.0001:.1f} pips).")
        return
    est_loss = abs(entry - sl) / spec["tickSize"] * price["lossTickValue"] * lot
    side = "BUY" if sig.direction > 0 else "SELL"
    log(f"{side} {lot} lot @ {entry:.5f}, SL {sl:.5f}, TP {tp:.5f}, rugi maks ~${est_loss:.2f}")

    if C.DRY_RUN:
        log("(simulasi, order tidak dikirim)")
        return
    opts = {"comment": "TrendBreakout", "magic": C.MAGIC}
    order = conn.create_market_buy_order if sig.direction > 0 else conn.create_market_sell_order
    res = await order(C.SYMBOL, lot, sl, tp, opts)
    log(f"Order terkirim: {res.get('stringCode')} {res.get('message')} posisi {res.get('positionId')}")

    # 6) Verifikasi SL benar-benar terpasang
    await asyncio.sleep(2)
    for p in await conn.get_positions():
        if str(p["id"]) == str(res.get("positionId")) and not p.get("stopLoss"):
            log("SL tidak terpasang! Posisi ditutup.")
            await conn.close_position(str(p["id"]))


async def main():
    api = MetaApi(os.environ["METAAPI_TOKEN"])
    account = await api.metatrader_account_api.get_account(os.environ["METAAPI_ACCOUNT_ID"])
    if account.state not in ("DEPLOYING", "DEPLOYED"):
        log("Menyalakan koneksi akun di MetaApi...")
        await account.deploy()
    await account.wait_connected()
    conn = account.get_rpc_connection()
    await conn.connect()
    await conn.wait_synchronized()
    try:
        await trade_once(account, conn)
    finally:
        await conn.close()


if __name__ == "__main__":
    code = 0
    try:
        asyncio.run(main())
    except Exception as e:  # tampilkan error dengan jelas di log GitHub
        log(f"ERROR: {type(e).__name__}: {e}")
        code = 1
    write_summary()
    sys.exit(code)
