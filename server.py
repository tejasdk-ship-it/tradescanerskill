#!/usr/bin/env python3
"""
TradeScanner Web Dashboard Server
Connects the web frontend to the scan.py trading engine.
"""

import os
import sys
import json
import time
import queue
import subprocess
import threading
import datetime
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS

# Determine directory paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TRADER_DIR = os.path.join(BASE_DIR, "trader")
UNIVERSE_FILE = os.path.join(TRADER_DIR, "universe.txt")
WATCHLIST_FILE = os.path.join(TRADER_DIR, "watchlist.json")

app = Flask(__name__, static_folder=STATIC_DIR)
CORS(app)

# Global active scan tracker
active_job = {
    "running": False,
    "job_id": None,
    "mode": None,
    "started_at": None,
    "progress_message": "Idle",
    "logs": [],
    "result": None,
    "error": None
}
job_lock = threading.Lock()

# Curated Presets for instantaneous 1-click scanning
PRESETS = {
    "mega_tech": {
        "name": "Mega-Cap Tech Titans",
        "description": "Top liquid tech companies & AI leaders",
        "symbols": ["AAPL", "NVDA", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "NFLX", "AMD", "AVGO", "QCOM", "INTC"]
    },
    "momentum": {
        "name": "High Beta & Momentum",
        "description": "High volatility, active day trading tickers",
        "symbols": ["SMCI", "PLTR", "COIN", "MSTR", "ARM", "MARA", "APP", "HOOD", "SOFI", "IONQ", "DKNG", "RBLX"]
    },
    "semis": {
        "name": "Semiconductors & Hardware",
        "description": "Chip designers, foundries & equipment makers",
        "symbols": ["NVDA", "AMD", "TSM", "AVGO", "ASML", "MU", "ARM", "QCOM", "MRVL", "LRCX", "AMAT", "KLAC"]
    },
    "sp_leaders": {
        "name": "S&P 50 Core Leaders",
        "description": "Most liquid names across major sectors",
        "symbols": [
            "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "BRK.B", "UNH", "XOM",
            "JNJ", "JPM", "V", "PG", "MA", "HD", "CVX", "MRK", "ABBV", "COST",
            "PEP", "KO", "BAC", "WMT", "ADBE", "CRM", "AMD", "NFLX", "TMO", "ACN",
            "MCD", "CSCO", "ABT", "LIN", "DHR", "DIS", "TXN", "WFC", "PM", "INTC"
        ]
    },
    "etfs_indices": {
        "name": "Index & Sector Proxies",
        "description": "Core market indicators and proxies",
        "symbols": ["SPY", "QQQ", "IWM", "DIA", "SMH", "XLF", "XLE", "XLK", "XBI"]
    }
}

# New York Market Time Helper
def get_ny_time():
    utc = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    # DST approximate offset for New York: -4 (EDT) or -5 (EST)
    # DST runs second Sunday in March to first Sunday in November
    year = utc.year
    # March second Sunday
    m_first = datetime.date(year, 3, 1)
    m_second_sun = m_first + datetime.timedelta(days=(6 - m_first.weekday()) % 7 + 7)
    # Nov first Sunday
    n_first = datetime.date(year, 11, 1)
    n_first_sun = n_first + datetime.timedelta(days=(6 - n_first.weekday()) % 7)
    
    start_dst = datetime.datetime.combine(m_second_sun, datetime.time(7, 0)) # 2am EST
    end_dst = datetime.datetime.combine(n_first_sun, datetime.time(6, 0))   # 2am EDT
    
    offset_hours = -4 if (start_dst <= utc < end_dst) else -5
    ny_dt = utc + datetime.timedelta(hours=offset_hours)
    
    # Check market open status (9:30 AM to 4:00 PM ET on weekdays)
    weekday = ny_dt.weekday()
    is_weekend = weekday >= 5
    ny_time_val = ny_dt.time()
    market_open = (not is_weekend) and (datetime.time(9, 30) <= ny_time_val <= datetime.time(16, 0))
    
    return {
        "iso": ny_dt.isoformat(),
        "time_str": ny_dt.strftime("%I:%M %p ET"),
        "date_str": ny_dt.strftime("%A, %b %d, %Y"),
        "offset": offset_hours,
        "is_weekend": is_weekend,
        "is_market_open": market_open,
        "session_phase": "Regular Hours (9:30 - 16:00)" if market_open else ("Weekend" if is_weekend else ("Pre-Market" if ny_time_val < datetime.time(9, 30) else "Post-Market"))
    }


def get_universe_cache():
    if not os.path.exists(UNIVERSE_FILE):
        return []
    items = []
    try:
        with open(UNIVERSE_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and "|" in line:
                    parts = line.split("|", 1)
                    items.append({"symbol": parts[0].strip(), "name": parts[1].strip()})
    except Exception as e:
        print("Error reading universe:", e)
    return items


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:path>")
def static_proxy(path):
    if os.path.exists(os.path.join(STATIC_DIR, path)):
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/api/status", methods=["GET"])
def api_status():
    ny_info = get_ny_time()
    universe_exists = os.path.exists(UNIVERSE_FILE)
    universe_count = 0
    if universe_exists:
        try:
            with open(UNIVERSE_FILE, "r", encoding="utf-8") as f:
                universe_count = sum(1 for _ in f)
        except Exception:
            pass

    watchlist_exists = os.path.exists(WATCHLIST_FILE)
    watchlist_meta = {}
    if watchlist_exists:
        try:
            with open(WATCHLIST_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                watchlist_meta = {
                    "as_of": data.get("as_of"),
                    "mode": data.get("mode"),
                    "created_at": data.get("created_at"),
                    "hits_count": len(data.get("hits", [])),
                    "scanned": data.get("scanned", 0)
                }
        except Exception:
            pass

    return jsonify({
        "status": "online",
        "market": ny_info,
        "universe": {
            "exists": universe_exists,
            "count": universe_count,
            "path": UNIVERSE_FILE
        },
        "watchlist": {
            "exists": watchlist_exists,
            "meta": watchlist_meta,
            "path": WATCHLIST_FILE
        },
        "active_job": {
            "running": active_job["running"],
            "mode": active_job["mode"],
            "progress_message": active_job["progress_message"]
        }
    })


@app.route("/api/presets", methods=["GET"])
def api_presets():
    return jsonify(PRESETS)


@app.route("/api/universe", methods=["GET"])
def api_universe():
    query = request.args.get("q", "").strip().upper()
    limit = int(request.args.get("limit", 100))
    items = get_universe_cache()
    if query:
        items = [x for x in items if query in x["symbol"] or query in x["name"].upper()]
    return jsonify({
        "total": len(items),
        "results": items[:limit]
    })


@app.route("/api/watchlist", methods=["GET"])
def api_watchlist():
    if not os.path.exists(WATCHLIST_FILE):
        return jsonify({
            "exists": False,
            "hits": [],
            "message": "Watchlist has not been generated yet. Run a daily or ORB scan to create it."
        })
    try:
        with open(WATCHLIST_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return jsonify(dict(data, exists=True))
    except Exception as e:
        return jsonify({"exists": False, "error": str(e), "hits": []}), 500


def run_scanner_worker(cmd_args, mode):
    global active_job
    with job_lock:
        active_job["running"] = True
        active_job["mode"] = mode
        active_job["started_at"] = time.time()
        active_job["progress_message"] = f"Running {mode} scan..."
        active_job["logs"] = []
        active_job["result"] = None
        active_job["error"] = None

    try:
        active_job["logs"].append(f"Starting command: {' '.join(cmd_args)}")
        
        # Run python scan.py
        proc = subprocess.Popen(
            cmd_args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=BASE_DIR,
            text=True,
            bufsize=1
        )

        stdout_lines = []
        stderr_lines = []

        # Stream stderr line by line for progress
        def read_pipe(pipe, is_stderr=False):
            for line in iter(pipe.readline, ''):
                clean = line.strip()
                if clean:
                    active_job["logs"].append(clean)
                    active_job["progress_message"] = clean[:120]
                    if is_stderr:
                        stderr_lines.append(clean)
                    else:
                        stdout_lines.append(clean)
            pipe.close()

        t_err = threading.Thread(target=read_pipe, args=(proc.stderr, True))
        t_out = threading.Thread(target=read_pipe, args=(proc.stdout, False))
        t_err.start()
        t_out.start()
        t_err.join()
        t_out.join()

        return_code = proc.wait()
        full_output = "\n".join(stdout_lines)

        # Parse JSON output from stdout if available
        parsed_result = None
        try:
            parsed_result = json.loads(full_output)
        except Exception:
            # Check if watchlist was written
            if os.path.exists(WATCHLIST_FILE):
                try:
                    with open(WATCHLIST_FILE, "r", encoding="utf-8") as wf:
                        parsed_result = json.load(wf)
                except Exception:
                    pass

        with job_lock:
            active_job["running"] = False
            active_job["progress_message"] = f"Scan complete! (exit code: {return_code})"
            active_job["result"] = parsed_result
            if return_code != 0 and not parsed_result:
                active_job["error"] = "\n".join(stderr_lines) or "Scan returned code 1 with no hits or failure."

    except Exception as e:
        with job_lock:
            active_job["running"] = False
            active_job["error"] = str(e)
            active_job["progress_message"] = f"Error: {e}"


@app.route("/api/scan/start", methods=["POST"])
def api_scan_start():
    global active_job
    with job_lock:
        if active_job["running"]:
            return jsonify({"success": False, "error": "A scan is already in progress. Please wait for it to finish."}), 400

    payload = request.get_json() or {}
    mode = payload.get("mode", "daily") # "daily", "orb", "universe"
    
    python_exe = sys.executable or "python"
    scan_script = os.path.join(BASE_DIR, "scan.py")
    cmd_args = [python_exe, scan_script, mode]

    if mode == "universe":
        cmd_args.append("--json")
    elif mode in ("daily", "orb"):
        # Source symbols
        source_type = payload.get("source_type", "presets") # "presets", "custom", "universe", "watchlist"
        preset_key = payload.get("preset_key", "mega_tech")
        custom_symbols = payload.get("custom_symbols", "").strip()
        limit = payload.get("limit")

        if source_type == "presets" and preset_key in PRESETS:
            symbols_list = PRESETS[preset_key]["symbols"]
            cmd_args.extend(["--symbols", ",".join(symbols_list)])
        elif source_type == "custom" and custom_symbols:
            # sanitize symbols
            cleaned = [s.strip().upper() for s in custom_symbols.replace(" ", ",").split(",") if s.strip()]
            cmd_args.extend(["--symbols", ",".join(cleaned)])
        elif source_type == "universe":
            if limit:
                cmd_args.extend(["--limit", str(int(limit))])
        elif source_type == "watchlist":
            cmd_args.extend(["--watchlist", WATCHLIST_FILE])

        # Filters
        min_price = payload.get("min_price")
        min_volume = payload.get("min_volume")
        if min_price is not None:
            cmd_args.extend(["--min-price", str(float(min_price))])
        if min_volume is not None:
            cmd_args.extend(["--min-volume", str(int(min_volume))])

        # ORB specific flags
        if mode == "orb":
            or_mins = payload.get("or_minutes", 15)
            cmd_args.extend(["--or-minutes", str(int(or_mins))])
            at_time = payload.get("at")
            if at_time:
                cmd_args.extend(["--at", str(at_time)])
            max_confirm = payload.get("max_confirm")
            if max_confirm is not None:
                cmd_args.extend(["--max-confirm", str(int(max_confirm))])

        cmd_args.append("--json")

    # Start thread
    th = threading.Thread(target=run_scanner_worker, args=(cmd_args, mode))
    th.daemon = True
    th.start()

    return jsonify({
        "success": True,
        "message": f"Scan started in mode '{mode}'",
        "command": cmd_args
    })


@app.route("/api/scan/status", methods=["GET"])
def api_scan_status():
    with job_lock:
        return jsonify({
            "running": active_job["running"],
            "mode": active_job["mode"],
            "started_at": active_job["started_at"],
            "progress_message": active_job["progress_message"],
            "logs": active_job["logs"][-30:],
            "has_result": active_job["result"] is not None,
            "result": active_job["result"],
            "error": active_job["error"]
        })


@app.route("/api/quote/<symbol>", methods=["GET"])
def api_quote(symbol):
    """
    Fetches real-time price snapshot and mini 1-month spark/history for visual chart display
    """
    sym = symbol.strip().upper()
    try:
        import urllib.request
        # Fetch spark from query2 or query1
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=1mo&interval=1d"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        
        result = data.get("chart", {}).get("result", [None])[0]
        if not result:
            return jsonify({"error": "No chart data returned"}), 404

        meta = result.get("meta", {})
        indicators = result.get("indicators", {})
        quote_data = indicators.get("quote", [{}])[0]
        timestamps = result.get("timestamp", [])

        closes = quote_data.get("close", [])
        highs = quote_data.get("high", [])
        lows = quote_data.get("low", [])
        opens = quote_data.get("open", [])
        volumes = quote_data.get("volume", [])

        # Clean null values
        points = []
        for i in range(len(timestamps)):
            if i < len(closes) and closes[i] is not None:
                points.append({
                    "time": timestamps[i],
                    "open": opens[i] if i < len(opens) and opens[i] is not None else closes[i],
                    "high": highs[i] if i < len(highs) and highs[i] is not None else closes[i],
                    "low": lows[i] if i < len(lows) and lows[i] is not None else closes[i],
                    "close": closes[i],
                    "volume": volumes[i] if i < len(volumes) and volumes[i] is not None else 0
                })

        return jsonify({
            "symbol": sym,
            "currency": meta.get("currency", "USD"),
            "regularMarketPrice": meta.get("regularMarketPrice"),
            "previousClose": meta.get("chartPreviousClose"),
            "fiftyTwoWeekHigh": meta.get("fiftyTwoWeekHigh"),
            "fiftyTwoWeekLow": meta.get("fiftyTwoWeekLow"),
            "regularMarketVolume": meta.get("regularMarketVolume"),
            "points": points
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print(f"======================================================")
    print(f"  TRADESCANNER DASHBOARD SERVER STARTED               ")
    print(f"  Live UI: http://localhost:{port}                    ")
    print(f"======================================================")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
