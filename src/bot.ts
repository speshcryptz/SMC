import { Telegraf } from 'telegraf';
import { SMCEngine } from './smc';
import { logUserInteraction } from './db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('TELEGRAM_BOT_TOKEN must be provided!');
    process.exit(1);
}

const bot = new Telegraf(token);
const engine = new SMCEngine();

bot.start((ctx) => {
    ctx.reply(
        `Welcome to the SMC Signal Bot!\n\n` +
        `Simply send me a ticker symbol (e.g., BTCUSDT, ETHUSDT) and I will analyze the 24H timeframe on MEXC.`
    );
});

bot.help((ctx) => {
    ctx.reply('To use this bot, type a valid Crypto ticker from MEXC, e.g. BTCUSDT.');
});

bot.on('text', async (ctx) => {
    const symbol = ctx.message.text.trim().toUpperCase();

    // Basic heuristic to avoid processing normal chat
    if (symbol.length > 20 || symbol.includes(' ')) {
        return;
    }

    try {
        ctx.reply(`Fetching 24H data for ${symbol} on MEXC...`);
        
        // Fetch last 200 daily candles (24H timeframe)
        const candles = await engine.fetchOHLCV(symbol, '1d', 200);
        
        if (candles.length < 50) {
            ctx.reply(`Not enough data for ${symbol} to perform an SMC analysis.`);
            return;
        }

        const analysis = engine.analyze(candles);

        const responseText = 
            `Overall trend: ${analysis.trend}\n` +
            `Liquidity swept: ${analysis.liquiditySwept}\n` +
            `Zone touched: ${analysis.zoneTouched}\n` +
            `CHOCH detected?: ${analysis.choch}\n` +
            `BOS confirmation?: ${analysis.bos}\n` +
            `FVG alignment?: ${analysis.fvgAligned}\n` +
            `Final verdict: ${analysis.verdict}`;
        
        // Output specific format required for setups
        let finalResponse = responseText;
        if (analysis.verdict === 'BUY SIGNAL') {
            finalResponse += `\n\nBUY SIGNAL: liquidity swept + CHOCH + BOS + demand zone confirmation.\n`;
            finalResponse += `\n🔵 Entry Point: ${analysis.entryPrice}\n🟢 Take Profit (TP): ${analysis.tp}\n🔴 Stop Loss (SL): ${analysis.sl}\n⚖️ Risk/Reward Ratio: 1:${analysis.rr}\n💰 Est. PNL ($10 at 10x): $${analysis.pnl.toFixed(2)}\n⚡ Confidence Rating: ${analysis.confidence}%`;
        } else if (analysis.verdict === 'SELL SIGNAL') {
            finalResponse += `\n\nSELL SIGNAL: liquidity swept + CHOCH + BOS + supply zone confirmation.\n`;
            finalResponse += `\n🔴 Entry Point: ${analysis.entryPrice}\n🟢 Take Profit (TP): ${analysis.tp}\n🔴 Stop Loss (SL): ${analysis.sl}\n⚖️ Risk/Reward Ratio: 1:${analysis.rr}\n💰 Est. PNL ($10 at 10x): $${analysis.pnl.toFixed(2)}\n⚡ Confidence Rating: ${analysis.confidence}%`;
        }

        ctx.reply(finalResponse);

        // Background log
        logUserInteraction(ctx.from.id, ctx.from.username || 'unknown', symbol, analysis.verdict)
            .catch(console.error);

    } catch (error: any) {
        if (error.message && error.message.includes('ExchangeNotAvailable')) {
           ctx.reply(`Ticker ${symbol} not found on MEXC or exchange unavailable.`);
        } else {
            console.error(error);
            ctx.reply(`An error occurred while analyzing ${symbol}. Please ensure it is a valid MEXC pair like BTCUSDT.`);
        }
    }
});

// Start the bot
export function startBot() {
    bot.launch();
    console.log('SMC Bot is running...');
    
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
