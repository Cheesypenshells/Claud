"""Simulasi satu kali jalan robot dengan broker palsu (tanpa internet)."""
import asyncio
from datetime import datetime, timedelta, timezone

import robot.main as main
from robot import config as C


class FakeAccount:
    def __init__(self, candles):
        self.candles = candles

    async def get_historical_candles(self, symbol, tf, start, limit):
        return list(reversed(self.candles))


class FakeConn:
    def __init__(self, positions=None, deals=None, acc_type="ACCOUNT_TRADE_MODE_DEMO"):
        self.positions = positions or []
        self.deals = deals or []
        self.orders = []
        self.closed = []
        self.acc_type = acc_type

    async def get_account_information(self):
        return {"login": 1, "server": "MetaQuotes-Demo", "balance": 3000.0, "equity": 3000.0,
                "currency": "USD", "type": self.acc_type}

    async def get_positions(self):
        return self.positions

    async def get_deals_by_time_range(self, a, b):
        return {"deals": self.deals}

    async def get_symbol_specification(self, s):
        return {"point": 0.00001, "digits": 5, "tickSize": 0.00001, "stopsLevel": 0,
                "minVolume": 0.01, "maxVolume": 100.0, "volumeStep": 0.01}

    async def get_symbol_price(self, s):
        return {"bid": 1.10000, "ask": 1.10008, "lossTickValue": 1.0}

    async def create_market_buy_order(self, *a):
        self.orders.append(("BUY",) + a)
        self.positions = [{"id": 7, "symbol": C.SYMBOL, "magic": C.MAGIC, "stopLoss": a[2]}]
        return {"stringCode": "TRADE_RETCODE_DONE", "message": "ok", "positionId": "7"}

    create_market_sell_order = create_market_buy_order

    async def close_position(self, pid):
        self.closed.append(pid)


def breakout_candles(now):
    closes = [1.05 + i * 0.0001 for i in range(300)] + [1.05 + 300 * 0.0001 + 0.003]
    start = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=len(closes))
    return [{"time": start + timedelta(hours=i), "high": c + 0.0005, "low": c - 0.0005, "close": c}
            for i, c in enumerate(closes)]


def run(conn, account, monkeypatch, now, dry=False):
    monkeypatch.setattr(C, "DRY_RUN", dry)

    class FixedDT(datetime):
        @classmethod
        def now(cls, tz=None):
            return now
    monkeypatch.setattr(main, "datetime", FixedDT)
    asyncio.run(main.trade_once(account, conn))


NOW = datetime(2026, 11, 19, 14, 5, tzinfo=timezone.utc)   # Kamis 21:05 WIB, sesi London+NY


def test_opens_trade_with_sl_and_risk_cap(monkeypatch):
    conn = FakeConn()
    run(conn, FakeAccount(breakout_candles(NOW)), monkeypatch, NOW)
    assert len(conn.orders) == 1
    side, sym, lot, sl, tp, opts = conn.orders[0]
    assert side == "BUY" and sym == "EURUSD" and sl < 1.10008 < tp
    assert (1.10008 - sl) / 0.00001 * lot <= 15.0 + 1e-6
    assert opts["magic"] == C.MAGIC


def test_dry_run_sends_nothing(monkeypatch):
    conn = FakeConn()
    run(conn, FakeAccount(breakout_candles(NOW)), monkeypatch, NOW, dry=True)
    assert conn.orders == []


def test_refuses_real_account(monkeypatch):
    conn = FakeConn(acc_type="ACCOUNT_TRADE_MODE_REAL")
    run(conn, FakeAccount(breakout_candles(NOW)), monkeypatch, NOW)
    assert conn.orders == []


def test_closes_position_without_sl(monkeypatch):
    conn = FakeConn(positions=[{"id": 5, "symbol": C.SYMBOL, "magic": C.MAGIC, "stopLoss": None,
                                "type": "POSITION_TYPE_BUY", "volume": 0.01, "profit": 0.0}])
    run(conn, FakeAccount(breakout_candles(NOW)), monkeypatch, NOW)
    assert conn.closed == ["5"] and conn.orders == []


def test_no_trade_outside_session(monkeypatch):
    conn = FakeConn()
    at_5am_wib = datetime(2026, 11, 19, 22, 5, tzinfo=timezone.utc)
    run(conn, FakeAccount(breakout_candles(at_5am_wib)), monkeypatch, at_5am_wib)
    assert conn.orders == []
