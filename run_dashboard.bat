@echo off
title TradeScanner Live Terminal
color 0B
echo ========================================================
echo    TRADESCANNER LIVE WEB TERMINAL
echo    Real-Time Market Setup & Opening-Range Scanner
echo ========================================================
echo.
echo Starting TradeScanner backend server on http://localhost:5050 ...
echo.

start "" "http://localhost:5050"
python server.py

pause
