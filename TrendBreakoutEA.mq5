//+------------------------------------------------------------------+
//| TrendBreakoutEA.mq5                                              |
//| Robot trading EURUSD: breakout Donchian + filter tren EMA 200    |
//| (terinspirasi aturan Turtle Traders, Richard Dennis 1983)        |
//|                                                                  |
//| Aturan risiko:                                                   |
//|  - Setiap posisi WAJIB punya stop loss, risiko maks $15          |
//|  - Batas rugi harian $25 (risiko posisi berikutnya dipotong      |
//|    supaya total rugi hari itu tidak melewati $25)                |
//|  - Kalah 3x berturut-turut -> berhenti trading 24 jam            |
//|  - Default hanya boleh jalan di akun DEMO                        |
//+------------------------------------------------------------------+
#property version   "1.00"
#property description "Breakout Donchian + EMA200, risiko terkunci per posisi & per hari"

#include <Trade\Trade.mqh>

input group "Strategi"
input ENUM_TIMEFRAMES InpTF          = PERIOD_H1; // Timeframe
input int             InpDonchian    = 20;        // Periode breakout (jumlah candle)
input int             InpEmaPeriod   = 200;       // EMA filter tren
input int             InpAtrPeriod   = 14;        // Periode ATR
input double          InpAtrSlMult   = 2.0;       // Jarak SL = ATR x ini
input double          InpRewardRisk  = 2.0;       // TP = jarak SL x ini
input int             InpMaxSpread   = 20;        // Spread maksimal (points)

input group "Jam Trading (sesi London & New York)"
input bool InpSessionFilter      = true; // Hanya buka posisi di sesi London & New York
input int  InpSessionStartLondon = 8;    // Mulai buka posisi (jam LONDON) = 15:00 WIB / 14:00 WIB musim panas
input int  InpSessionEndLondon   = 21;   // Stop buka posisi (jam LONDON) = 04:00 WIB / 03:00 WIB musim panas
input int  InpServerGmtWinter    = 2;    // Zona waktu server saat musim dingin (GMT+), MetaQuotes = 2
input bool InpServerEuDst        = true; // Server ikut perubahan jam musim panas Eropa

input group "Manajemen Risiko"
input double InpRiskPerTradeUSD   = 15.0; // Rugi maksimal per posisi ($)
input double InpDailyLossLimitUSD = 25.0; // Rugi maksimal per hari ($)
input int    InpMaxConsecLosses   = 3;    // Kalah berturut-turut sebelum jeda
input int    InpPauseHours        = 24;   // Lama jeda setelah kalah beruntun (jam)

input group "Lainnya"
input bool InpAllowRealAccount = false;   // Izinkan akun REAL (default: hanya demo)
input long InpMagic            = 20261118;

CTrade   trade;
int      hEma = INVALID_HANDLE, hAtr = INVALID_HANDLE;
datetime lastBarTime = 0;
string   gvPauseUntil, gvResetTime;

//+------------------------------------------------------------------+
int OnInit()
  {
   bool isTester = (bool)MQLInfoInteger(MQL_TESTER);
   long mode     = AccountInfoInteger(ACCOUNT_TRADE_MODE);
   if(!isTester && mode == ACCOUNT_TRADE_MODE_REAL && !InpAllowRealAccount)
     {
      Alert("TrendBreakoutEA: akun REAL terdeteksi. Robot hanya boleh jalan di DEMO ",
            "sampai Anda mengaktifkan InpAllowRealAccount.");
      return INIT_FAILED;
     }
   if(AccountInfoString(ACCOUNT_CURRENCY) != "USD")
      Print("PERINGATAN: mata uang akun bukan USD, batas $ dihitung dalam ",
            AccountInfoString(ACCOUNT_CURRENCY));
   if(StringFind(_Symbol, "EURUSD") < 0)
      Print("PERINGATAN: robot ini dirancang & diuji untuk EURUSD, sekarang di ", _Symbol);

   hEma = iMA(_Symbol, InpTF, InpEmaPeriod, 0, MODE_EMA, PRICE_CLOSE);
   hAtr = iATR(_Symbol, InpTF, InpAtrPeriod);
   if(hEma == INVALID_HANDLE || hAtr == INVALID_HANDLE)
      return INIT_FAILED;

   string prefix = "TBEA_" + _Symbol + "_" + IntegerToString(InpMagic);
   gvPauseUntil  = prefix + "_pause";
   gvResetTime   = prefix + "_reset";
   if(!GlobalVariableCheck(gvResetTime))
      GlobalVariableSet(gvResetTime, (double)TimeCurrent());

   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(10);
   return INIT_SUCCEEDED;
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   if(hEma != INVALID_HANDLE) IndicatorRelease(hEma);
   if(hAtr != INVALID_HANDLE) IndicatorRelease(hAtr);
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   EnforceStopLoss();               // pengaman: tidak boleh ada posisi tanpa SL

   datetime barTime = iTime(_Symbol, InpTF, 0);
   if(barTime == lastBarTime) return;   // hanya cek sinyal sekali per candle baru
   lastBarTime = barTime;

   if(HasOpenPosition()) return;        // satu posisi dalam satu waktu

   string reason;
   double riskBudget = AllowedRiskUSD(reason);
   if(riskBudget <= 0)
     {
      Print("Tidak trading: ", reason);
      return;
     }

   int signal = GetSignal();
   if(signal != 0)
      OpenTrade(signal, riskBudget);
  }

//+------------------------------------------------------------------+
//| Sinyal: +1 buy, -1 sell, 0 tidak ada                             |
//+------------------------------------------------------------------+
int GetSignal()
  {
   if(!InLondonNySession()) return 0;
   if(SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) > InpMaxSpread) return 0;

   double ema[1];
   if(CopyBuffer(hEma, 0, 1, 1, ema) != 1) return 0;

   double close1 = iClose(_Symbol, InpTF, 1);
   int    hiIdx  = iHighest(_Symbol, InpTF, MODE_HIGH, InpDonchian, 2);
   int    loIdx  = iLowest(_Symbol, InpTF, MODE_LOW, InpDonchian, 2);
   if(hiIdx < 0 || loIdx < 0) return 0;
   double hh = iHigh(_Symbol, InpTF, hiIdx);
   double ll = iLow(_Symbol, InpTF, loIdx);

   if(close1 > hh && close1 > ema[0]) return  1;  // breakout ke atas, searah tren naik
   if(close1 < ll && close1 < ema[0]) return -1;  // breakout ke bawah, searah tren turun
   return 0;
  }

//+------------------------------------------------------------------+
//| Konversi waktu: server -> GMT -> London                          |
//| Jam diatur dalam waktu London supaya otomatis ikut pergeseran    |
//| jam musim panas/dingin, baik di backtest maupun akun live.       |
//+------------------------------------------------------------------+
datetime LastSundayUtc(int year, int mon)      // Maret & Oktober: 31 hari
  {
   MqlDateTime d; ZeroMemory(d);
   d.year = year; d.mon = mon; d.day = 31; d.hour = 1;
   datetime t = StructToTime(d);
   TimeToStruct(t, d);
   return t - d.day_of_week * 86400;
  }

bool IsEuDst(datetime gmt)
  {
   MqlDateTime d; TimeToStruct(gmt, d);
   return gmt >= LastSundayUtc(d.year, 3) && gmt < LastSundayUtc(d.year, 10);
  }

datetime ServerToGmt(datetime srv)
  {
   datetime g = srv - InpServerGmtWinter * 3600;
   if(InpServerEuDst && IsEuDst(g)) g -= 3600;
   return g;
  }

bool InLondonNySession()
  {
   if(!InpSessionFilter) return true;
   datetime gmt    = ServerToGmt(TimeCurrent());
   datetime london = gmt + (IsEuDst(gmt) ? 3600 : 0);
   MqlDateTime l; TimeToStruct(london, l);
   if(l.day_of_week == 0 || l.day_of_week == 6) return false;
   return l.hour >= InpSessionStartLondon && l.hour < InpSessionEndLondon;
  }

//+------------------------------------------------------------------+
void OpenTrade(int dir, double riskUSD)
  {
   double atr[1];
   if(CopyBuffer(hAtr, 0, 1, 1, atr) != 1) return;

   double slDist  = atr[0] * InpAtrSlMult;
   double minDist = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   if(slDist < minDist) slDist = minDist;

   ENUM_ORDER_TYPE type = (dir > 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double price = (dir > 0) ? SymbolInfoDouble(_Symbol, SYMBOL_ASK)
                            : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double sl = NormalizeDouble(price - dir * slDist, _Digits);
   double tp = NormalizeDouble(price + dir * slDist * InpRewardRisk, _Digits);

   double lot = CalcLot(type, price, sl, riskUSD);
   if(lot <= 0)
     {
      PrintFormat("Lewati sinyal: lot minimum pun berisiko > $%.2f (jarak SL %.1f pips)",
                  riskUSD, slDist / (_Point * 10));
      return;
     }

   bool ok = (dir > 0) ? trade.Buy(lot, _Symbol, price, sl, tp, "TrendBreakout")
                       : trade.Sell(lot, _Symbol, price, sl, tp, "TrendBreakout");
   if(ok)
      PrintFormat("[%s WIB] %s %.2f lot @ %.5f  SL %.5f  TP %.5f  (risiko maks $%.2f)",
                  TimeToString(ServerToGmt(TimeCurrent()) + 7 * 3600, TIME_DATE | TIME_MINUTES),
                  dir > 0 ? "BUY" : "SELL", lot, price, sl, tp, riskUSD);
   else
      Print("Gagal buka posisi: ", trade.ResultRetcodeDescription());
  }

//+------------------------------------------------------------------+
//| Lot terbesar yang rugi-di-SL-nya <= riskUSD. 0 = tidak muat.     |
//+------------------------------------------------------------------+
double CalcLot(ENUM_ORDER_TYPE type, double price, double sl, double riskUSD)
  {
   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   double lossPerLot;
   if(!OrderCalcProfit(type, _Symbol, 1.0, price, sl, lossPerLot)) return 0;
   lossPerLot = MathAbs(lossPerLot);
   if(lossPerLot <= 0) return 0;

   double lot = MathFloor(riskUSD / lossPerLot / step) * step;
   lot = MathMin(lot, maxLot);

   // cek ulang dengan perhitungan broker, turunkan kalau masih kebesaran
   double loss;
   while(lot >= minLot && OrderCalcProfit(type, _Symbol, lot, price, sl, loss)
         && MathAbs(loss) > riskUSD)
      lot -= step;

   if(lot < minLot) return 0;
   return NormalizeDouble(lot, 2);
  }

//+------------------------------------------------------------------+
//| Berapa $ yang boleh dirisikokan sekarang (0 = dilarang trading)  |
//+------------------------------------------------------------------+
double AllowedRiskUSD(string &reason)
  {
   datetime now = TimeCurrent();

   // 1) masih dalam jeda setelah kalah beruntun?
   if(GlobalVariableCheck(gvPauseUntil))
     {
      datetime until = (datetime)GlobalVariableGet(gvPauseUntil);
      if(now < until)
        {
         reason = "jeda setelah " + IntegerToString(InpMaxConsecLosses) +
                  "x kalah beruntun, sampai " + TimeToString(until);
         return 0;
        }
     }

   // 2) cek kalah beruntun sejak reset terakhir
   if(ConsecutiveLosses() >= InpMaxConsecLosses)
     {
      GlobalVariableSet(gvPauseUntil, (double)(now + InpPauseHours * 3600));
      GlobalVariableSet(gvResetTime, (double)now);
      reason = IntegerToString(InpMaxConsecLosses) + "x kalah beruntun, jeda " +
               IntegerToString(InpPauseHours) + " jam dimulai";
      return 0;
     }

   // 3) sisa jatah rugi hari ini
   double todayLoss = MathMax(0.0, -TodayNetPL());
   double remaining = InpDailyLossLimitUSD - todayLoss;
   if(remaining <= 0.01)
     {
      reason = StringFormat("batas rugi harian $%.2f tercapai (rugi hari ini $%.2f)",
                            InpDailyLossLimitUSD, todayLoss);
      return 0;
     }
   return MathMin(InpRiskPerTradeUSD, remaining);
  }

//+------------------------------------------------------------------+
double TodayNetPL()
  {
   MqlDateTime d; TimeToStruct(TimeCurrent(), d);
   d.hour = 0; d.min = 0; d.sec = 0;
   if(!HistorySelect(StructToTime(d), TimeCurrent() + 60)) return 0;

   double sum = 0;
   for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
     {
      ulong tk = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(tk, DEAL_MAGIC) != InpMagic) continue;
      if(HistoryDealGetString(tk, DEAL_SYMBOL) != _Symbol) continue;
      sum += HistoryDealGetDouble(tk, DEAL_PROFIT) + HistoryDealGetDouble(tk, DEAL_SWAP)
           + HistoryDealGetDouble(tk, DEAL_COMMISSION);
     }
   return sum;
  }

//+------------------------------------------------------------------+
int ConsecutiveLosses()
  {
   datetime from = (datetime)GlobalVariableGet(gvResetTime);
   if(!HistorySelect(from, TimeCurrent() + 60)) return 0;

   int count = 0;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)          // urut dari lama ke baru
     {
      ulong tk = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(tk, DEAL_MAGIC) != InpMagic) continue;
      if(HistoryDealGetString(tk, DEAL_SYMBOL) != _Symbol) continue;
      if(HistoryDealGetInteger(tk, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      double net = HistoryDealGetDouble(tk, DEAL_PROFIT) + HistoryDealGetDouble(tk, DEAL_SWAP)
                 + HistoryDealGetDouble(tk, DEAL_COMMISSION);
      count = (net < 0) ? count + 1 : 0;
     }
   return count;
  }

//+------------------------------------------------------------------+
bool HasOpenPosition()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
      if(PositionGetSymbol(i) == _Symbol && PositionGetInteger(POSITION_MAGIC) == InpMagic)
         return true;
   return false;
  }

//+------------------------------------------------------------------+
//| Posisi milik robot tanpa SL langsung ditutup                     |
//+------------------------------------------------------------------+
void EnforceStopLoss()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetSymbol(i) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      if(PositionGetDouble(POSITION_SL) == 0)
        {
         ulong tk = (ulong)PositionGetInteger(POSITION_TICKET);
         Print("Posisi #", tk, " tanpa stop loss -> ditutup demi keamanan");
         trade.PositionClose(tk);
        }
     }
  }
//+------------------------------------------------------------------+
