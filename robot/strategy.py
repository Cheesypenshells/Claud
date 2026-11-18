"""Perhitungan indikator & sinyal. Murni matematika, tanpa koneksi broker."""
from dataclasses import dataclass


def ema(values, period):
    if len(values) < period:
        return None
    k = 2 / (period + 1)
    e = sum(values[:period]) / period
    for v in values[period:]:
        e = v * k + e * (1 - k)
    return e


def atr(highs, lows, closes, period):
    if len(closes) < period + 1:
        return None
    trs = [max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
           for i in range(1, len(closes))]
    a = sum(trs[:period]) / period
    for tr in trs[period:]:
        a = (a * (period - 1) + tr) / period
    return a


@dataclass
class Signal:
    direction: int          # +1 buy, -1 sell
    sl_distance: float      # jarak stop loss dalam harga
    reason: str


def compute_signal(candles, donchian=20, ema_period=200, atr_period=14, atr_mult=2.0):
    """candles: list dict {high, low, close}, urut lama -> baru, HANYA candle yang sudah tutup."""
    if len(candles) < ema_period + donchian + 1:
        return None
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    closes = [c["close"] for c in candles]

    last_close = closes[-1]
    hh = max(highs[-1 - donchian:-1])
    ll = min(lows[-1 - donchian:-1])
    trend = ema(closes, ema_period)
    vol = atr(highs, lows, closes, atr_period)
    sl_distance = vol * atr_mult

    if last_close > hh and last_close > trend:
        return Signal(1, sl_distance, f"close {last_close:.5f} > high {donchian} candle {hh:.5f}, di atas EMA{ema_period} {trend:.5f}")
    if last_close < ll and last_close < trend:
        return Signal(-1, sl_distance, f"close {last_close:.5f} < low {donchian} candle {ll:.5f}, di bawah EMA{ema_period} {trend:.5f}")
    return None
