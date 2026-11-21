//+------------------------------------------------------------------+
//| MultiRobotEA.mq5                                                 |
//| 4 robot dalam 1 file. Pasang file yang sama di 4 chart, pilih    |
//| nomor robot di tab Inputs:                                       |
//|   1 = Candlestick (engulfing & pin bar searah tren)              |
//|   2 = Trader terkenal (aturan Turtle Traders, Richard Dennis)    |
//|   3 = Pemburu tren (scan beberapa simbol, ikut tren terkuat)     |
//|   4 = Otak gabungan (pakai sinyal robot 1-3 yang hasilnya        |
//|       paling bagus di transaksi terakhir)                        |
//|                                                                  |
//| Aturan risiko tiap robot (dihitung terpisah per robot):          |
//|  - Modal virtual $100. Kalau habis -> robot mati permanen        |
//|  - Setiap posisi WAJIB punya stop loss                           |
//|  - Rugi maks per posisi & per hari (WIB)                         |
//|  - 3x kalah beruntun hari ini -> berhenti sampai besok (WIB)     |
//|  - Risiko ikut besar/kecil sesuai modal robot (adaptif)          |
//|  - Default hanya boleh jalan di akun DEMO                        |
//+------------------------------------------------------------------+
#property version   "1.00"
#property description "4 robot: 1 Candlestick, 2 Turtle, 3 Tren, 4 Otak gabungan. Risiko terkunci per robot."

#include <Trade\Trade.mqh>

enum ENUM_ROBOT
  {
   ROBOT_CANDLE = 1, // 1 - Candlestick
   ROBOT_TURTLE = 2, // 2 - Trader terkenal (Turtle)
   ROBOT_TREND  = 3, // 3 - Pemburu tren
   ROBOT_BRAIN  = 4  // 4 - Otak gabungan
  };

input group "Pilih robot"
input ENUM_ROBOT InpRobot = ROBOT_CANDLE;            // Robot yang dijalankan di chart ini

input group "Modal & risiko (per robot)"
input double InpVirtualCapital    = 100.0;          // Modal robot ($). Habis = robot mati permanen
input double InpRiskPerTradeUSD   = 15.0;           // Rugi maks per posisi ($) saat modal masih awal
input bool   InpScaleRisk         = true;           // Risiko ikut naik/turun sesuai modal robot
input double InpDailyLossLimitUSD = 25.0;           // Rugi maks per hari WIB ($)
input int    InpMaxLossesPerDay   = 3;              // Kalah beruntun hari ini -> stop sampai besok

input group "Strategi"
input string          InpMainSymbol  = "EURUSD";    // Simbol utama robot 1, 2 & 4 (chart boleh apa saja)
input ENUM_TIMEFRAMES InpTF          = PERIOD_H1;   // Timeframe
input double          InpRewardRisk  = 2.0;         // TP = jarak SL x ini
input string          InpTrendSymbols = "EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD"; // Simbol untuk robot 3 & 4
input int             InpBrainLookback = 20;        // Robot 4: jumlah transaksi terakhir yang dinilai

input group "Jam trading (waktu London)"
input bool InpSessionFilter      = true; // Hanya buka posisi di sesi London & New York
input int  InpSessionStartLondon = 8;    // Mulai (jam London) = 15:00 WIB / 14:00 WIB musim panas
input int  InpSessionEndLondon   = 21;   // Selesai (jam London) = 04:00 WIB / 03:00 WIB musim panas
input bool InpCloseAtSessionEnd  = true; // Trading harian: tutup posisi saat sesi selesai
input int  InpServerGmtWinter    = 2;    // Zona waktu server musim dingin (GMT+), MetaQuotes = 2
input bool InpServerEuDst        = true; // Server ikut jam musim panas Eropa

input group "Lainnya"
input bool InpAllowRealAccount = false;  // Izinkan akun REAL (default: hanya demo)
input long InpMagicBase        = 20261100; // Magic dasar (robot N memakai dasar + N)

//--- tipe data
struct TradeSignal
  {
   int    dir;       // +1 buy, -1 sell
   string sym;
   double sl_dist;   // jarak SL dalam harga
   string why;
  };

struct Stats
  {
   double total;        // net P/L sejak awal
   int    closedTotal;  // jumlah posisi ditutup
   double todayNet;     // net P/L hari ini (WIB)
   int    todayStreak;  // kalah beruntun hari ini
   double lastNet;      // net P/L N transaksi terakhir
   int    lastCount;
   int    lastWins;
  };

struct SymData
  {
   string sym;
   bool   inTrendList;
   int    ema20, ema50, ema100, ema200, atr;
  };

//--- global
CTrade   trade;
long     g_magic;
datetime g_lastBar = 0;
SymData  g_data[];
string   g_status = "Menunggu candle baru...";
bool     g_deadAlerted = false;

//+------------------------------------------------------------------+
string RobotName(int r)
  {
   switch(r)
     {
      case 1: return "Robot 1 - Candlestick";
      case 2: return "Robot 2 - Trader terkenal (Turtle)";
      case 3: return "Robot 3 - Pemburu tren";
      case 4: return "Robot 4 - Otak gabungan";
     }
   return "Robot ?";
  }

//+------------------------------------------------------------------+
bool AddSymbol(string sym, bool inTrend)
  {
   for(int i = 0; i < ArraySize(g_data); i++)
      if(g_data[i].sym == sym)
        {
         if(inTrend) g_data[i].inTrendList = true;
         return true;
        }
   if(!SymbolSelect(sym, true))
     {
      Print("Simbol ", sym, " tidak tersedia di broker ini, dilewati.");
      return false;
     }
   int n = ArraySize(g_data);
   ArrayResize(g_data, n + 1);
   g_data[n].sym         = sym;
   g_data[n].inTrendList = inTrend;
   g_data[n].ema20  = iMA(sym, InpTF, 20,  0, MODE_EMA, PRICE_CLOSE);
   g_data[n].ema50  = iMA(sym, InpTF, 50,  0, MODE_EMA, PRICE_CLOSE);
   g_data[n].ema100 = iMA(sym, InpTF, 100, 0, MODE_EMA, PRICE_CLOSE);
   g_data[n].ema200 = iMA(sym, InpTF, 200, 0, MODE_EMA, PRICE_CLOSE);
   g_data[n].atr    = iATR(sym, InpTF, 14);
   return true;
  }

int DataIndex(string sym)
  {
   for(int i = 0; i < ArraySize(g_data); i++)
      if(g_data[i].sym == sym) return i;
   return -1;
  }

double Buf(int handle, int shift)
  {
   double b[];
   if(handle == INVALID_HANDLE) return EMPTY_VALUE;
   if(CopyBuffer(handle, 0, shift, 1, b) != 1) return EMPTY_VALUE;
   return b[0];
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   bool isTester = (bool)MQLInfoInteger(MQL_TESTER);
   if(!isTester && AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_REAL && !InpAllowRealAccount)
     {
      Alert("MultiRobotEA: akun REAL terdeteksi. Robot hanya boleh di DEMO sampai InpAllowRealAccount diaktifkan.");
      return INIT_FAILED;
     }

   g_magic = InpMagicBase + (long)InpRobot;
   trade.SetExpertMagicNumber(g_magic);
   trade.SetDeviationInPoints(20);

   if(!AddSymbol(InpMainSymbol, false))
     {
      Alert("MultiRobotEA: simbol utama ", InpMainSymbol, " tidak ditemukan.");
      return INIT_FAILED;
     }
   if(InpRobot == ROBOT_TREND || InpRobot == ROBOT_BRAIN)
     {
      string parts[];
      int n = StringSplit(InpTrendSymbols, ',', parts);
      for(int i = 0; i < n; i++)
        {
         string s = parts[i];
         StringTrimLeft(s);
         StringTrimRight(s);
         if(s != "") AddSymbol(s, true);
        }
     }

   EventSetTimer(30);
   Print(RobotName((int)InpRobot), " aktif, simbol utama ", InpMainSymbol, ", magic ", g_magic,
         ", modal virtual $", DoubleToString(InpVirtualCapital, 2));
   ShowStatus();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   for(int i = 0; i < ArraySize(g_data); i++)
     {
      IndicatorRelease(g_data[i].ema20);
      IndicatorRelease(g_data[i].ema50);
      IndicatorRelease(g_data[i].ema100);
      IndicatorRelease(g_data[i].ema200);
      IndicatorRelease(g_data[i].atr);
     }
   Comment("");
  }

void OnTick()  { EnforceStopLoss(); }

void OnTimer()
  {
   EnforceStopLoss();
   if(InpCloseAtSessionEnd && !InSession()) CloseAllOwn("sesi trading selesai");

   datetime bar = iTime(InpMainSymbol, InpTF, 0);
   if(bar != 0 && bar != g_lastBar)
     {
      g_lastBar = bar;
      OnNewBar();
     }
   ShowStatus();
  }

//+------------------------------------------------------------------+
//| Dipanggil sekali per candle baru                                 |
//+------------------------------------------------------------------+
void OnNewBar()
  {
   if(HasOpenPosition())
     {
      g_status = "Ada posisi terbuka, menunggu SL/TP.";
      return;
     }
   string why;
   double risk = AllowedRiskUSD(why);
   if(risk <= 0)
     {
      g_status = "Tidak trading: " + why;
      Print(RobotName((int)InpRobot), " | ", g_status);
      return;
     }
   if(!InSession())
     {
      g_status = "Di luar sesi London/New York.";
      return;
     }

   TradeSignal s;
   s.dir = 0; s.sym = ""; s.sl_dist = 0; s.why = "";
   bool has = false;
   switch(InpRobot)
     {
      case ROBOT_CANDLE: has = SignalCandle(s); break;
      case ROBOT_TURTLE: has = SignalTurtle(s); break;
      case ROBOT_TREND:  has = SignalTrend(s);  break;
      case ROBOT_BRAIN:  has = SignalBrain(s);  break;
     }
   if(!has)
     {
      g_status = "Tidak ada sinyal di candle ini. (" + why + ")";
      return;
     }
   Print(RobotName((int)InpRobot), " | SINYAL ", (s.dir > 0 ? "BUY " : "SELL "), s.sym, ": ", s.why);
   OpenTrade(s, risk);
  }

//+------------------------------------------------------------------+
//| ROBOT 1: candlestick (engulfing / pin bar) searah EMA50          |
//+------------------------------------------------------------------+
bool SignalCandle(TradeSignal &s)
  {
   string sym = InpMainSymbol;
   int i = DataIndex(sym);
   if(i < 0) return false;
   double ema50 = Buf(g_data[i].ema50, 1);
   double atr   = Buf(g_data[i].atr, 1);
   if(ema50 == EMPTY_VALUE || atr == EMPTY_VALUE || atr <= 0) return false;

   double o1 = iOpen(sym, InpTF, 1), c1 = iClose(sym, InpTF, 1);
   double h1 = iHigh(sym, InpTF, 1), l1 = iLow(sym, InpTF, 1);
   double o2 = iOpen(sym, InpTF, 2), c2 = iClose(sym, InpTF, 2);
   double range = h1 - l1;
   if(range <= 0 || c1 == 0 || c2 == 0) return false;
   double body  = MathAbs(c1 - o1);
   double upper = h1 - MathMax(o1, c1);
   double lower = MathMin(o1, c1) - l1;

   bool bullEngulf = (c2 < o2 && c1 > o1 && c1 >= o2 && o1 <= c2 && body >= 0.3 * atr);
   bool bearEngulf = (c2 > o2 && c1 < o1 && c1 <= o2 && o1 >= c2 && body >= 0.3 * atr);
   bool bullPin    = (lower >= 2.0 * body && lower >= 0.6 * range && range >= 0.5 * atr);
   bool bearPin    = (upper >= 2.0 * body && upper >= 0.6 * range && range >= 0.5 * atr);

   if((bullEngulf || bullPin) && c1 > ema50)
     {
      s.dir = 1; s.sym = sym;
      s.sl_dist = MathMax((c1 - l1) + 0.2 * atr, atr);
      s.why = (bullEngulf ? "bullish engulfing" : "bullish pin bar") + StringFormat(", di atas EMA50 %.5f", ema50);
      return true;
     }
   if((bearEngulf || bearPin) && c1 < ema50)
     {
      s.dir = -1; s.sym = sym;
      s.sl_dist = MathMax((h1 - c1) + 0.2 * atr, atr);
      s.why = (bearEngulf ? "bearish engulfing" : "bearish pin bar") + StringFormat(", di bawah EMA50 %.5f", ema50);
      return true;
     }
   return false;
  }

//+------------------------------------------------------------------+
//| ROBOT 2: aturan Turtle Traders: breakout 20 candle + EMA200      |
//+------------------------------------------------------------------+
bool SignalTurtle(TradeSignal &s)
  {
   string sym = InpMainSymbol;
   int i = DataIndex(sym);
   if(i < 0) return false;
   double ema200 = Buf(g_data[i].ema200, 1);
   double atr    = Buf(g_data[i].atr, 1);
   if(ema200 == EMPTY_VALUE || atr == EMPTY_VALUE || atr <= 0) return false;

   double c1 = iClose(sym, InpTF, 1);
   int hiIdx = iHighest(sym, InpTF, MODE_HIGH, 20, 2);
   int loIdx = iLowest(sym, InpTF, MODE_LOW, 20, 2);
   if(c1 == 0 || hiIdx < 0 || loIdx < 0) return false;
   double hh = iHigh(sym, InpTF, hiIdx);
   double ll = iLow(sym, InpTF, loIdx);

   if(c1 > hh && c1 > ema200)
     {
      s.dir = 1; s.sym = sym; s.sl_dist = 2.0 * atr;
      s.why = StringFormat("breakout di atas high 20 candle %.5f, di atas EMA200", hh);
      return true;
     }
   if(c1 < ll && c1 < ema200)
     {
      s.dir = -1; s.sym = sym; s.sl_dist = 2.0 * atr;
      s.why = StringFormat("breakout di bawah low 20 candle %.5f, di bawah EMA200", ll);
      return true;
     }
   return false;
  }

//+------------------------------------------------------------------+
//| ROBOT 3: cari simbol dengan tren terkuat, masuk saat pullback    |
//+------------------------------------------------------------------+
bool SignalTrend(TradeSignal &s)
  {
   double best = 0;
   bool found = false;
   for(int i = 0; i < ArraySize(g_data); i++)
     {
      if(!g_data[i].inTrendList) continue;
      string sym = g_data[i].sym;
      double e20  = Buf(g_data[i].ema20, 1);
      double e50  = Buf(g_data[i].ema50, 1);
      double e100 = Buf(g_data[i].ema100, 1);
      double atr  = Buf(g_data[i].atr, 1);
      if(e20 == EMPTY_VALUE || e50 == EMPTY_VALUE || e100 == EMPTY_VALUE || atr == EMPTY_VALUE || atr <= 0)
         continue;
      double c1 = iClose(sym, InpTF, 1), h1 = iHigh(sym, InpTF, 1), l1 = iLow(sym, InpTF, 1);
      if(c1 == 0) continue;

      double strength = (e20 - e100) / atr;
      int dir = 0;
      if(e20 > e50 && e50 > e100 && l1 <= e20 && c1 > e20) dir = 1;    // tren naik, pantul dari EMA20
      if(e20 < e50 && e50 < e100 && h1 >= e20 && c1 < e20) dir = -1;   // tren turun, pantul dari EMA20
      if(dir == 0 || MathAbs(strength) < 1.0) continue;

      if(MathAbs(strength) > best)
        {
         best = MathAbs(strength);
         s.dir = dir; s.sym = sym; s.sl_dist = 2.0 * atr;
         s.why = StringFormat("%s tren %s (kekuatan %.1f), pullback ke EMA20",
                              sym, dir > 0 ? "naik" : "turun", strength);
         found = true;
        }
     }
   return found;
  }

//+------------------------------------------------------------------+
//| ROBOT 4: pilih sinyal dari robot 1-3 yang hasilnya terbaik       |
//+------------------------------------------------------------------+
bool SignalBrain(TradeSignal &out)
  {
   TradeSignal c[3];
   bool has[3];
   for(int k = 0; k < 3; k++) { c[k].dir = 0; c[k].sym = ""; c[k].sl_dist = 0; c[k].why = ""; }
   has[0] = SignalCandle(c[0]);
   has[1] = SignalTurtle(c[1]);
   has[2] = SignalTrend(c[2]);

   int    order[3] = {1, 2, 0};   // kalau nilainya sama: Turtle, Tren, Candlestick
   int    best = -1;
   double bestScore = -DBL_MAX;
   string report = "";
   for(int k = 0; k < 3; k++)
     {
      int r = order[k];
      Stats st;
      GetStats(InpMagicBase + r + 1, st, InpBrainLookback);
      double avg = (st.lastCount > 0) ? st.lastNet / st.lastCount : 0.0;
      double wr  = (st.lastCount > 0) ? 100.0 * st.lastWins / st.lastCount : 0.0;
      report += StringFormat(" R%d: %d trx, winrate %.0f%%, rata2 $%.2f%s;", r + 1, st.lastCount, wr, avg,
                             has[r] ? " [ada sinyal]" : "");
      if(!has[r]) continue;
      double score = (st.lastCount >= 5) ? avg : 0.0;   // belum cukup data = netral
      if(st.lastCount >= 5 && avg <= 0) continue;       // robot yang sedang rugi tidak diikuti
      if(score > bestScore) { bestScore = score; best = r; }
     }
   Print("Robot 4 menilai:", report);
   if(best < 0) return false;
   out = c[best];
   out.why = "ikut Robot " + IntegerToString(best + 1) + ": " + out.why;
   return true;
  }

//+------------------------------------------------------------------+
//| Eksekusi order                                                   |
//+------------------------------------------------------------------+
void OpenTrade(TradeSignal &s, double riskUSD)
  {
   if(SymbolInfoInteger(s.sym, SYMBOL_TRADE_MODE) != SYMBOL_TRADE_MODE_FULL)
     {
      Print("Lewati: ", s.sym, " tidak bisa dibuka buy/sell penuh di akun ini.");
      return;
     }
   MqlTick tk;
   if(!SymbolInfoTick(s.sym, tk) || tk.ask <= 0 || tk.bid <= 0) return;
   int    digits = (int)SymbolInfoInteger(s.sym, SYMBOL_DIGITS);
   double point  = SymbolInfoDouble(s.sym, SYMBOL_POINT);

   double dist    = s.sl_dist;
   double minDist = (double)SymbolInfoInteger(s.sym, SYMBOL_TRADE_STOPS_LEVEL) * point;
   if(dist < minDist) dist = minDist;
   if((tk.ask - tk.bid) > 0.25 * dist)
     {
      Print("Lewati: spread ", s.sym, " terlalu lebar dibanding jarak SL.");
      return;
     }

   ENUM_ORDER_TYPE type = (s.dir > 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double price = (s.dir > 0) ? tk.ask : tk.bid;
   double sl = NormalizeDouble(price - s.dir * dist, digits);
   double tp = NormalizeDouble(price + s.dir * dist * InpRewardRisk, digits);

   double lot = CalcLot(s.sym, type, price, sl, riskUSD);
   if(lot <= 0)
     {
      Print("Lewati: lot minimum ", s.sym, " pun berisiko > $", DoubleToString(riskUSD, 2));
      g_status = "Sinyal dilewati: lot minimum terlalu berisiko.";
      return;
     }

   trade.SetTypeFillingBySymbol(s.sym);
   string cmt = "R" + IntegerToString((int)InpRobot);
   bool ok = (s.dir > 0) ? trade.Buy(lot, s.sym, price, sl, tp, cmt)
                         : trade.Sell(lot, s.sym, price, sl, tp, cmt);
   if(ok)
     {
      g_status = StringFormat("%s %s %.2f lot, SL %s, TP %s, risiko maks $%.2f",
                              s.dir > 0 ? "BUY" : "SELL", s.sym, lot,
                              DoubleToString(sl, digits), DoubleToString(tp, digits), riskUSD);
      Print(RobotName((int)InpRobot), " | [", WibString(), "] ", g_status);
     }
   else
      Print(RobotName((int)InpRobot), " | Gagal buka posisi: ", trade.ResultRetcodeDescription());
  }

double CalcLot(string sym, ENUM_ORDER_TYPE type, double price, double sl, double riskUSD)
  {
   double minLot = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
   if(step <= 0) return 0;

   double lossPerLot;
   if(!OrderCalcProfit(type, sym, 1.0, price, sl, lossPerLot)) return 0;
   lossPerLot = MathAbs(lossPerLot);
   if(lossPerLot <= 0) return 0;

   double lot = MathFloor(riskUSD / lossPerLot / step) * step;
   lot = MathMin(lot, maxLot);
   double loss;
   while(lot >= minLot && OrderCalcProfit(type, sym, lot, price, sl, loss) && MathAbs(loss) > riskUSD)
      lot -= step;
   if(lot < minLot) return 0;
   int decimals = (int)MathMax(0, MathCeil(-MathLog10(step)));
   return NormalizeDouble(lot, decimals);
  }

//+------------------------------------------------------------------+
//| Aturan risiko per robot                                          |
//+------------------------------------------------------------------+
double AllowedRiskUSD(string &why)
  {
   Stats st;
   GetStats(g_magic, st, InpBrainLookback);
   double equity = InpVirtualCapital + st.total;

   if(equity <= 0.01)
     {
      why = "MODAL ROBOT HABIS - robot mati permanen";
      if(!g_deadAlerted)
        {
         Alert(RobotName((int)InpRobot), ": modal $", DoubleToString(InpVirtualCapital, 0), " habis. Robot berhenti permanen.");
         g_deadAlerted = true;
        }
      return 0;
     }
   if(st.todayStreak >= InpMaxLossesPerDay)
     {
      why = IntegerToString(st.todayStreak) + "x kalah beruntun hari ini, berhenti sampai besok (WIB)";
      return 0;
     }
   double lossToday = MathMax(0.0, -st.todayNet);
   double remaining = InpDailyLossLimitUSD - lossToday;
   if(remaining <= 0.01)
     {
      why = StringFormat("batas rugi harian $%.2f tercapai", InpDailyLossLimitUSD);
      return 0;
     }

   double risk = InpRiskPerTradeUSD;
   if(InpScaleRisk) risk = InpRiskPerTradeUSD * equity / InpVirtualCapital;   // adaptif: ikut modal
   risk = MathMin(risk, remaining);
   risk = MathMin(risk, equity);
   why = StringFormat("modal $%.2f, rugi hari ini $%.2f, risiko posisi berikutnya $%.2f", equity, lossToday, risk);
   return risk;
  }

void GetStats(long magic, Stats &st, int lookback)
  {
   ZeroMemory(st);
   datetime now = TimeCurrent();
   datetime dayStart = WibDayStartServer(now);
   if(!HistorySelect(0, now + 60)) return;
   int total = HistoryDealsTotal();

   for(int i = 0; i < total; i++)               // lama -> baru
     {
      ulong tk = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(tk, DEAL_MAGIC) != magic) continue;
      double net = HistoryDealGetDouble(tk, DEAL_PROFIT) + HistoryDealGetDouble(tk, DEAL_SWAP)
                 + HistoryDealGetDouble(tk, DEAL_COMMISSION);
      datetime t = (datetime)HistoryDealGetInteger(tk, DEAL_TIME);
      st.total += net;
      if(t >= dayStart) st.todayNet += net;
      long entry = HistoryDealGetInteger(tk, DEAL_ENTRY);
      if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY || entry == DEAL_ENTRY_INOUT)
        {
         st.closedTotal++;
         if(t >= dayStart) st.todayStreak = (net < 0) ? st.todayStreak + 1 : 0;
        }
     }
   for(int i = total - 1; i >= 0 && st.lastCount < lookback; i--)   // baru -> lama
     {
      ulong tk = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(tk, DEAL_MAGIC) != magic) continue;
      long entry = HistoryDealGetInteger(tk, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT) continue;
      double net = HistoryDealGetDouble(tk, DEAL_PROFIT) + HistoryDealGetDouble(tk, DEAL_SWAP)
                 + HistoryDealGetDouble(tk, DEAL_COMMISSION);
      st.lastCount++;
      st.lastNet += net;
      if(net > 0) st.lastWins++;
     }
  }

//+------------------------------------------------------------------+
//| Posisi                                                           |
//+------------------------------------------------------------------+
bool HasOpenPosition()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
      if(PositionGetSymbol(i) != "" && PositionGetInteger(POSITION_MAGIC) == g_magic)
         return true;
   return false;
  }

void EnforceStopLoss()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetSymbol(i) == "") continue;
      if(PositionGetInteger(POSITION_MAGIC) != g_magic) continue;
      if(PositionGetDouble(POSITION_SL) == 0)
        {
         ulong tk = (ulong)PositionGetInteger(POSITION_TICKET);
         Print("Posisi #", tk, " tanpa stop loss -> ditutup demi keamanan");
         trade.PositionClose(tk);
        }
     }
  }

void CloseAllOwn(string reason)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetSymbol(i) == "") continue;
      if(PositionGetInteger(POSITION_MAGIC) != g_magic) continue;
      ulong tk = (ulong)PositionGetInteger(POSITION_TICKET);
      Print(RobotName((int)InpRobot), " | tutup posisi #", tk, ": ", reason);
      trade.PositionClose(tk);
     }
  }

//+------------------------------------------------------------------+
//| Waktu: server -> GMT -> London / WIB                             |
//+------------------------------------------------------------------+
datetime LastSundayUtc(int year, int mon)
  {
   MqlDateTime d;
   ZeroMemory(d);
   d.year = year; d.mon = mon; d.day = 31; d.hour = 1;
   datetime t = StructToTime(d);
   TimeToStruct(t, d);
   return t - d.day_of_week * 86400;
  }

bool IsEuDst(datetime gmt)
  {
   MqlDateTime d;
   TimeToStruct(gmt, d);
   return gmt >= LastSundayUtc(d.year, 3) && gmt < LastSundayUtc(d.year, 10);
  }

datetime ServerToGmt(datetime srv)
  {
   datetime g = srv - InpServerGmtWinter * 3600;
   if(InpServerEuDst && IsEuDst(g)) g -= 3600;
   return g;
  }

bool InSession()
  {
   if(!InpSessionFilter) return true;
   datetime gmt    = ServerToGmt(TimeCurrent());
   datetime london = gmt + (IsEuDst(gmt) ? 3600 : 0);
   MqlDateTime l;
   TimeToStruct(london, l);
   if(l.day_of_week == 0 || l.day_of_week == 6) return false;
   return l.hour >= InpSessionStartLondon && l.hour < InpSessionEndLondon;
  }

datetime WibDayStartServer(datetime srv)
  {
   long gmt    = (long)ServerToGmt(srv);
   long offset = (long)srv - gmt;
   long wib    = gmt + 7 * 3600;
   long wibDay = wib - (wib % 86400);
   return (datetime)(wibDay - 7 * 3600 + offset);
  }

string WibString()
  {
   return TimeToString(ServerToGmt(TimeCurrent()) + 7 * 3600, TIME_DATE | TIME_MINUTES) + " WIB";
  }

//+------------------------------------------------------------------+
//| Status di pojok kiri atas chart                                  |
//+------------------------------------------------------------------+
void ShowStatus()
  {
   Stats st;
   GetStats(g_magic, st, InpBrainLookback);
   double equity = InpVirtualCapital + st.total;
   double wr = (st.lastCount > 0) ? 100.0 * st.lastWins / st.lastCount : 0.0;
   string txt = RobotName((int)InpRobot) + "   (magic " + IntegerToString(g_magic) + ")\n"
              + StringFormat("Modal robot: $%.2f dari $%.2f  (%+.1f%%)\n", equity, InpVirtualCapital,
                             100.0 * st.total / InpVirtualCapital)
              + StringFormat("Hari ini: $%.2f   |   kalah beruntun hari ini: %d\n", st.todayNet, st.todayStreak)
              + StringFormat("Transaksi selesai: %d   |   winrate %d terakhir: %.0f%%\n", st.closedTotal, st.lastCount, wr)
              + "Waktu: " + WibString() + (InSession() ? "  (sesi aktif)" : "  (di luar sesi)") + "\n"
              + "Status: " + g_status;
   Comment(txt);
  }
//+------------------------------------------------------------------+
