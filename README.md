# SMC Telegram Signal Bot

A powerful Crypto futures signal bot built with TypeScript, Telegraf, and CCXT. This algorithmic bot implements a strict Smart Money Concepts (SMC) trading strategy based on the Lewis Kelly setup to automatically analyze tickers on MEXC and generate highly probable execution signals directly to Telegram.

## Features
- 📊 **Fully Algorithmic SMC Engine**: Deterministically identifies Market Structure (BOS/CHOCH), Supply/Demand Zones, Liquidity Sweeps, and Fair Value Gaps (FVGs).
- 🎯 **Optimized Limit Entries**: Calculates intelligent entry points on the edge of the supply/demand zones instead of indiscriminate market execution.
- ⚡ **Confidence Rating**: Scores every setup out of 100% based on macro trend alignment, deep liquidity sweeps, and unmitigated FVG backing.
- 💰 **Risk Management**: Generates signals with mathematically structured Stop Losses, 1:2 Risk/Reward Targets, and calculates assumed Position Size/PNL metrics.
- 🗄️ **Supabase Backend**: Logs query histories and tracks active users for analytics scaling without interrupting execution payload latency.

---

## The SMC Strategy Logic

The engine (found at `src/smc.ts`) utilizes the following technical milestones on the 24H (Daily) timeframe before issuing a signal.

1. **Market Structure Calculation:** First, it maps the current market trend by plotting 5-bar fractals (creating Swings Highs and Lows).
2. **Zone Registration:** It searches backwards and highlights the "Last opposing candle" before an impulse that caused a Break of Structure (BOS). This defines the Supply and Demand Zones.
3. **Liquidity Sweep Detection:** It checks if price wicks beyond a pre-established Swing level, trapping traders, but closes back *inside* the safe range.
4. **Trigger Generation:** A `BUY` or `SELL` signal is strictly dispatched ONLY IF:
   - Liquidity is swept (SSL for buys, BSL for sells).
   - The price mitigates an unbroken valid Zone.
   - Price establishes a CHOCH (Change of Character) from bearish to bullish (or vice versa).
   - A subsequent BOS confirms the leg.

---

## Parameter Adjustments

To dial in the bot's variables based on your trading style, adjust these parameters in `src/smc.ts`:

- **Timeframe Config**: The bot retrieves data via `fetchOHLCV(symbol, '1d', 200)`. Change `'1d'` to `'1h'` or `'15m'` to calculate intrastate/scalp SMC setups.
- **Risk / Reward Ratio**: In `src/smc.ts` (around `rr = 2`), you can adjust the fixed Risk multiplier if you want tighter 1:3 RR targets or looser 1:1.5 RR settings.
- **Swing Fractal Size**: Swings are generated via the boolean `isSwingHigh` looking 2 candles backwards and 2 candles forwards. Expanding this to 3 candles (`i - 3`, `i + 3`) restricts the engine to only detect Macro sweeps.
- **Confidence Weights**: Edit the modifiers `confidence += 15` during the boolean checks for `fvgAligned` or `isDeepSweep`.

---

## Getting Started

### 1. Requirements
Ensure you have Node.js installed, as well as an established connection to:
- Telegram BotFather (Token).
- Supabase Project (URL and Anon key).

### 2. Installation
Install dependencies:
```bash
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env` and configure it:
```env
TELEGRAM_BOT_TOKEN="your_token"
SUPABASE_URL="your_url"
SUPABASE_ANON_KEY="your_anon_key"
```

### 4. Running Locally
For development and real-time viewing logs:
```bash
npm run dev
```

### 5. Production
To compile and run efficiently via PM2 daemon:
```bash
npm run build
npx pm2 start dist/index.js --name smc-bot
```
