// MarketMonitor.ts
import { EventEmitter } from 'events';

interface MarketEvents {
  tweet: (...args: any[]) => void;
}

class MarketMonitor extends EventEmitter {
    private static instance: MarketMonitor;

    private constructor() {
        super();
    }

    public static getInstance(): MarketMonitor {
        if (!MarketMonitor.instance) {
            MarketMonitor.instance = new MarketMonitor();
        }
        return MarketMonitor.instance;
    }

    on<K extends keyof MarketEvents>(event: K, listener: MarketEvents[K]): this {
        return super.on(event, listener);
    }

    emit<K extends keyof MarketEvents>(event: K, ...args: Parameters<MarketEvents[K]>): boolean {
        return super.emit(event, ...args);
    }
}

export default MarketMonitor.getInstance();