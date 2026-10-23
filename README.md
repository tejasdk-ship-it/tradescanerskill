# 📡 TradeScanner Pro — Real-Time Market Setup & ORB Scanner

A professional-grade real-time market scanner and interactive web dashboard for US equities. It scans thousands of charts for high-probability setups: 20-day closing-high breakouts, bull flags, 20-day moving average reclaims, oversold conditions, oversold bounces, and 5-minute opening-range breakouts (ORB).

Powered by a lightweight Python/Flask backend integrated directly with the algorithmic `scan.py` engine and standard market feeds.

---

## ⚡ Quick Start (1-Click Run)

### Method 1: Double-Click the Windows Launcher
Simply double-click:
```
run_dashboard.bat
```
This automatically starts the server and opens `http://localhost:5050` in your default web browser.

### Method 2: Command Line
Open PowerShell or Command Prompt in this folder and run:
```bash
python server.py
```
Then visit **[http://localhost:5050](http://localhost:5050)**.

---

## 🧭 Step-by-Step Daily Trading Workflow

### Step 1: Pre-Market Preparation (8:00 AM – 9:25 AM ET)
1. Open the TradeScanner dashboard at `http://localhost:5050`.
2. Check the **Market Clock** indicator in the top header.
3. Keep the mode on **Daily Setups**.
4. Choose your universe source:
   - **Presets:** Instant 1-click scan across curated lists (Mega-Cap Tech, High Beta Momentum, Semiconductors, S&P 50).
   - **Custom:** Type in specific tickers (e.g. `AAPL, TSLA, NVDA, COIN, PLTR, AMD`).
   - **All (5,943):** Scan the broader US market universe with an optional limit (50, 150, 300, 1000).
5. Click **"Execute Live Scan"**.
6. The engine fetches daily closes from free Yahoo spark endpoints (20 per request) and flags setups:
   - **`breakout_20d` (20-Day Breakout):** Last close is higher than every close of the prior 20 sessions.
   - **`bull_flag` (Bull Flag):** Rose >10% over 10 days, followed by tight consolidation within 5% over the last 5 sessions.
   - **`reclaim_ma20` (MA20 Reclaim):** Closed below the 20-day average yesterday, closed back above it today.
   - **`oversold` & `oversold_bounce`:** 14-period Wilder RSI under 30 with a bullish turn.

### Step 2: Opening Range Establishment (9:30 AM – 9:45 AM ET)
- When regular New York market trading opens at 9:30 AM ET, allow the first 15 minutes of 5-minute bars to establish the session high and low.
- Avoid chasing blind orders in the first 5 minutes; let institutions establish range boundaries.

### Step 3: Run Intraday Opening-Range Breakout (ORB) (After 9:50 AM ET)
1. Switch the Scan Type to **Intraday ORB**.
2. Select your ticker preset or watchlist.
3. Click **"Execute Live Scan"**.
4. The scanner identifies any stock where a completed 5-minute bar closed strictly above the 15-minute opening range high.
5. Review the trigger timestamp (e.g., `09:55 ET`, `10:05 ET`) and percentage expansion.

### Step 4: Analyze Chart & Manage Risk
1. Click any ticker in the table or click **"View Chart"** to inspect:
   - Recent daily price action & 52-week high/low range.
   - Exact algorithmic setup description.
   - Direct 1-click links to TradingView and Yahoo Finance.
2. Adhere to strict day-trading risk management:
   - **Entry:** On confirmed 5-minute close or retest of range high.
   - **Stop Loss:** Midpoint of opening range or breakout bar low.
   - **Target:** 2:1 or 3:1 Reward-to-Risk ratio.

---

## 🗂️ File & Project Structure

```
tradescanerskill/
├── run_dashboard.bat        # 1-Click Windows launcher
├── server.py                # Python Flask REST API & background scan runner
├── scan.py                  # Core algorithmic market scanner engine
├── SKILL.md                 # Original skill specification
├── static/                  # Web dashboard frontend
│   ├── index.html           # Dark terminal UI layout
│   ├── css/
│   │   └── styles.css       # Obsidian glassmorphic design system
│   └── js/
│       └── app.js           # Client controller, Chart.js & API integrations
└── trader/                  # Generated persistent storage
    ├── universe.txt         # 5,943 filtered US equities from Nasdaq Trader
    └── watchlist.json       # Latest scan hits and metadata
```

---

## 💻 CLI Commands (Terminal Usage)

You can also run scans directly from your terminal:

```bash
# 1. Download & build symbol universe (5,943 US stocks)
python scan.py universe

# 2. Run daily setup scan on specific tickers
python scan.py daily --symbols AAPL,NVDA,TSLA,MSFT,AMZN

# 3. Run opening-range breakout scan with 10:15 cutoff
python scan.py orb --at 10:15 --symbols AAPL,NVDA,TSLA

# 4. Output as raw JSON
python scan.py daily --symbols AAPL,NVDA --json
```

---

> **Notice:** A scan is a list of charts that match algorithmic rules, not a list of stocks to buy, and a setup on a chart is not a prediction. Most people who day trade lose money. Always trade with risk capital and stop-loss orders.
