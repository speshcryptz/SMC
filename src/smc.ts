import ccxt from 'ccxt';

export interface Candle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface Swing {
    type: 'high' | 'low';
    price: number;
    index: number;
}

export interface Zone {
    type: 'supply' | 'demand';
    top: number;
    bottom: number;
    mitigated: boolean;
    index: number;
}

export interface FVG {
    type: 'bullish' | 'bearish';
    top: number;
    bottom: number;
    mitigated: boolean;
    index: number; // index of the middle candle
}

export class SMCEngine {
    private exchange: any;

    constructor() {
        this.exchange = new ccxt.mexc({ 
            enableRateLimit: true,
            timeout: 30000
        });
    }

    async fetchOHLCV(symbol: string, timeframe: string = '1d', limit: number = 200): Promise<Candle[]> {
        const ohlcv = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
        return ohlcv.map(c => ({
            timestamp: c[0] as number,
            open: c[1] as number,
            high: c[2] as number,
            low: c[3] as number,
            close: c[4] as number,
            volume: c[5] as number,
        }));
    }

    public analyze(candles: Candle[]) {
        let swings: Swing[] = [];
        let zones: Zone[] = [];
        let fvgs: FVG[] = [];

        let currentTrend: 'bullish' | 'bearish' | 'range' = 'range';
        
        let lastBOS: 'upside' | 'downside' | null = null;
        let lastCHOCH: 'bullish' | 'bearish' | null = null;

        let bslSwept = false;
        let sslSwept = false;
        let isDeepSweep = false;
        let zoneTouched: string = 'none';
        let fvgAligned = false;

        // Step 1: Identify Swings
        for (let i = 2; i < candles.length - 2; i++) {
            const isSwingHigh = candles[i].high > candles[i - 1].high &&
                                candles[i].high > candles[i - 2].high &&
                                candles[i].high > candles[i + 1].high &&
                                candles[i].high > candles[i + 2].high;

            const isSwingLow = candles[i].low < candles[i - 1].low &&
                               candles[i].low < candles[i - 2].low &&
                               candles[i].low < candles[i + 1].low &&
                               candles[i].low < candles[i + 2].low;

            if (isSwingHigh) swings.push({ type: 'high', price: candles[i].high, index: i });
            if (isSwingLow) swings.push({ type: 'low', price: candles[i].low, index: i });
        }

        // Step 2 & 5: FVG Detection
        for (let i = 2; i < candles.length; i++) {
            const c0 = candles[i - 2];
            const c2 = candles[i];
            
            if (c0 && c2) {
                if (c0.high < c2.low) {
                    fvgs.push({ type: 'bullish', top: c2.low, bottom: c0.high, mitigated: false, index: i - 1 });
                }
                if (c0.low > c2.high) {
                    fvgs.push({ type: 'bearish', top: c0.low, bottom: c2.high, mitigated: false, index: i - 1 });
                }
            }
        }

        for (let i = 5; i < candles.length; i++) {
            const candle = candles[i];
            if (!candle) continue;
            
            const activeSwings = swings.filter(s => s.index < i);
            const ah = activeSwings.filter(s => s.type === 'high');
            const al = activeSwings.filter(s => s.type === 'low');
            
            const prevHigh = ah.length > 0 ? ah[ah.length - 1] : null;
            const prevLow = al.length > 0 ? al[al.length - 1] : null;

            if (prevHigh && candle.close > prevHigh.price) {
                if (currentTrend === 'bearish' || currentTrend === 'range') {
                    lastCHOCH = 'bullish';
                    currentTrend = 'bullish';
                } else {
                    lastBOS = 'upside';
                }
                
                for(let j = i; j >= Math.max(0, i-10); j--) {
                    const c = candles[j];
                    if (c && c.close < c.open) {
                        zones.push({ type: 'demand', top: Math.max(c.open, c.close), bottom: c.low, mitigated: false, index: j });
                        break;
                    }
                }
            }

            if (prevLow && candle.close < prevLow.price) {
                if (currentTrend === 'bullish' || currentTrend === 'range') {
                    lastCHOCH = 'bearish';
                    currentTrend = 'bearish';
                } else {
                    lastBOS = 'downside';
                }

                for(let j = i; j >= Math.max(0, i-10); j--) {
                    const c = candles[j];
                    if (c && c.close > c.open) {
                        zones.push({ type: 'supply', top: c.high, bottom: Math.min(c.open, c.close), mitigated: false, index: j });
                        break;
                    }
                }
            }

            let bodySize = Math.abs(candle.open - candle.close);
            if (prevHigh && candle.high > prevHigh.price && candle.close <= prevHigh.price) {
                bslSwept = true;
                if ((candle.high - Math.max(candle.open, candle.close)) > bodySize) isDeepSweep = true;
            }
            if (prevLow && candle.low < prevLow.price && candle.close >= prevLow.price) {
                sslSwept = true;
                if ((Math.min(candle.open, candle.close) - candle.low) > bodySize) isDeepSweep = true;
            }
            
            zones.forEach(z => {
                if(!z.mitigated && candle.low <= z.top && candle.high >= z.bottom) {
                    z.mitigated = true;
                    if (i >= candles.length - 5) {
                        zoneTouched = z.type;
                    }
                }
            });

            fvgs.forEach(f => {
                if (!f.mitigated) {
                    if (f.type === 'bullish' && candle.low <= f.top) f.mitigated = true;
                    if (f.type === 'bearish' && candle.high >= f.bottom) f.mitigated = true;
                }
            });
            
            if (i >= candles.length - 5) {
                const recentBullFVG = fvgs.find(f => f.type === 'bullish' && !f.mitigated && candle.low <= f.top);
                const recentBearFVG = fvgs.find(f => f.type === 'bearish' && !f.mitigated && candle.high >= f.bottom);
                if (recentBullFVG || recentBearFVG) fvgAligned = true;
            }
        }

        let verdict = "NO SETUP";
        
        if (sslSwept && zoneTouched === 'demand' && lastCHOCH === 'bullish' && lastBOS === 'upside') {
            verdict = "BUY SIGNAL";
        }
        
        if (bslSwept && zoneTouched === 'supply' && lastCHOCH === 'bearish' && lastBOS === 'downside') {
            verdict = "SELL SIGNAL";
        }

        const lastCandle = candles[candles.length - 1];
        const currentPrice = lastCandle ? lastCandle.close : 0;
        let entryPrice = currentPrice;
        let tp = 0;
        let sl = 0;
        let rr = 0;
        let pnl = 0;
        let confidence = 0;

        const demandZones = zones.filter(z => z.type === 'demand');
        const recentDemand = demandZones[demandZones.length - 1];
        
        const supplyZones = zones.filter(z => z.type === 'supply');
        const recentSupply = supplyZones[supplyZones.length - 1];

        if (verdict === "BUY SIGNAL") {
            // Optimized Limit Order Entry
            entryPrice = recentDemand ? recentDemand.top : currentPrice;
            if (entryPrice > currentPrice) entryPrice = currentPrice; // If we're already deeper, use current.

            sl = recentDemand ? recentDemand.bottom : entryPrice * 0.99; 
            if (sl >= entryPrice) sl = entryPrice * 0.99;
            const risk = entryPrice - sl;
            tp = entryPrice + (risk * 2);
            rr = 2;
            
            confidence = 60;
            if (currentTrend === 'bullish') confidence += 15;
            if (fvgAligned) confidence += 15;
            if (isDeepSweep) confidence += 10;
            
        } else if (verdict === "SELL SIGNAL") {
            // Optimized Limit Order Entry
            entryPrice = recentSupply ? recentSupply.bottom : currentPrice;
            if (entryPrice < currentPrice) entryPrice = currentPrice;

            sl = recentSupply ? recentSupply.top : entryPrice * 1.01;
            if (sl <= entryPrice) sl = entryPrice * 1.01;
            const risk = sl - entryPrice;
            tp = entryPrice - (risk * 2);
            rr = 2;

            confidence = 60;
            if (currentTrend === 'bearish') confidence += 15;
            if (fvgAligned) confidence += 15;
            if (isDeepSweep) confidence += 10;
        }

        if (verdict !== "NO SETUP" && entryPrice > 0) {
            const positionSize = 10 * 10; // $10 capital * 10x leverage
            const percentMove = Math.abs(tp - entryPrice) / entryPrice;
            pnl = positionSize * percentMove;
        }

        return {
            trend: currentTrend,
            liquiditySwept: bslSwept && sslSwept ? 'Both' : (bslSwept ? 'BSL' : (sslSwept ? 'SSL' : 'None')),
            zoneTouched,
            choch: lastCHOCH !== null ? 'Yes' : 'No',
            bos: lastBOS !== null ? 'Yes' : 'No',
            fvgAligned: fvgAligned ? 'Yes' : 'No',
            verdict,
            entryPrice,
            tp,
            sl,
            rr,
            pnl,
            confidence
        };
    }
}
