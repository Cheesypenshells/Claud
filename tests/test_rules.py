from datetime import datetime, timedelta, timezone

from robot.risk import allowed_risk, calc_lot, in_session, pause_until
from robot.strategy import compute_signal

UTC = timezone.utc
M, S = 20261118, "EURUSD"


def deal(t, profit, entry="DEAL_ENTRY_OUT", magic=M):
    return {"time": t, "profit": profit, "swap": 0, "commission": 0,
            "entryType": entry, "symbol": S, "magic": magic}


def risk(deals, now):
    return allowed_risk(deals, S, M, now, 15.0, 25.0, 3, 24)


# ---- jam sesi ----
def test_session_winter():
    # 19 Nov 2026 (musim dingin): London = UTC
    assert not in_session(datetime(2026, 11, 19, 7, 30, tzinfo=UTC), 8, 21)   # 14:30 WIB
    assert in_session(datetime(2026, 11, 19, 8, 0, tzinfo=UTC), 8, 21)        # 15:00 WIB
    assert in_session(datetime(2026, 11, 19, 20, 59, tzinfo=UTC), 8, 21)      # 03:59 WIB
    assert not in_session(datetime(2026, 11, 19, 21, 0, tzinfo=UTC), 8, 21)   # 04:00 WIB


def test_session_summer_and_weekend():
    assert in_session(datetime(2026, 7, 15, 7, 0, tzinfo=UTC), 8, 21)         # 08:00 BST = 14:00 WIB
    assert not in_session(datetime(2026, 7, 15, 20, 0, tzinfo=UTC), 8, 21)    # 21:00 BST
    assert not in_session(datetime(2026, 11, 21, 12, 0, tzinfo=UTC), 8, 21)   # Sabtu


# ---- risiko ----
def test_full_risk_when_clean():
    now = datetime(2026, 11, 19, 10, tzinfo=UTC)
    assert risk([], now)[0] == 15.0


def test_daily_limit_caps_next_trade():
    now = datetime(2026, 11, 19, 10, tzinfo=UTC)                # 17:00 WIB
    r, _ = risk([deal(now - timedelta(hours=2), -15.0)], now)
    assert r == 10.0
    r, why = risk([deal(now - timedelta(hours=3), -15.0), deal(now - timedelta(hours=1), -10.0)], now)
    assert r == 0 and "harian" in why


def test_yesterday_loss_does_not_count():
    now = datetime(2026, 11, 19, 10, tzinfo=UTC)                # 17:00 WIB
    yesterday = datetime(2026, 11, 18, 10, tzinfo=UTC)
    assert risk([deal(yesterday, -25.0)], now)[0] == 15.0


def test_three_losses_pause_24h_then_reset():
    t0 = datetime(2026, 11, 16, 8, tzinfo=UTC)
    deals = [deal(t0, -5), deal(t0 + timedelta(hours=1), -5), deal(t0 + timedelta(hours=2), -5)]
    assert pause_until([(d["time"], d["profit"]) for d in deals], 3, 24) == t0 + timedelta(hours=26)
    r, why = risk(deals, t0 + timedelta(hours=10))
    assert r == 0 and "beruntun" in why
    assert risk(deals, t0 + timedelta(hours=27))[0] == 15.0   # jeda selesai, hitungan reset
    # satu kalah lagi setelah jeda tidak langsung memicu jeda baru
    deals.append(deal(t0 + timedelta(hours=28), -5))
    assert risk(deals, t0 + timedelta(hours=29))[0] == 15.0


def test_win_resets_streak_and_other_magic_ignored():
    t0 = datetime(2026, 11, 16, 8, tzinfo=UTC)
    deals = [deal(t0, -5), deal(t0 + timedelta(hours=1), 8), deal(t0 + timedelta(hours=2), -5),
             deal(t0 + timedelta(hours=3), -5), deal(t0 + timedelta(hours=4), -5, magic=1)]
    assert risk(deals, t0 + timedelta(days=2))[0] == 15.0


# ---- lot ----
def test_lot_eurusd():
    # EURUSD: tick 0.00001 = $1 per lot. SL 30 pips = $300/lot -> $15 => 0.05 lot
    assert calc_lot(15, 0.0030, 0.00001, 1.0, 0.01, 100, 0.01) == 0.05
    # $10 => 0.03 (dibulatkan ke bawah, tidak pernah lebih)
    assert calc_lot(10, 0.0030, 0.00001, 1.0, 0.01, 100, 0.01) == 0.03
    # SL 200 pips: 0.01 lot = $20 > $15 -> lewati
    assert calc_lot(15, 0.0200, 0.00001, 1.0, 0.01, 100, 0.01) == 0.0


# ---- sinyal ----
def _candles(closes):
    return [{"high": c + 0.0005, "low": c - 0.0005, "close": c} for c in closes]


def test_buy_breakout_in_uptrend():
    closes = [1.05 + i * 0.0001 for i in range(260)] + [1.05 + 260 * 0.0001 + 0.003]
    sig = compute_signal(_candles(closes))
    assert sig and sig.direction == 1 and sig.sl_distance > 0


def test_sell_breakout_in_downtrend():
    closes = [1.10 - i * 0.0001 for i in range(260)] + [1.10 - 260 * 0.0001 - 0.003]
    sig = compute_signal(_candles(closes))
    assert sig and sig.direction == -1


def test_no_signal_when_flat_or_short_history():
    assert compute_signal(_candles([1.08] * 300)) is None
    assert compute_signal(_candles([1.08] * 50)) is None
