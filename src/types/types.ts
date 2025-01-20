// Token related types
export interface TokenData {
    address: string;
    symbol: string;
    name: string;
    price: number;
    volume24h: number;
    holders: Holder[];
    sentimentScore: number;
    marketCap: number;
    supply: number;
    decimals: number;
    holderCount: number;
    riskScore: number;
}

export interface Holder {
    address: string;
    balance: number;
    tradingScore: number;
}

export interface SentimentData {
    positive: number;
    negative: number;
    neutral: number;
    overall: number;
    timestamp: number;
}

// Trading related types
export interface Position {
    id: string;
    tokenAddress: string;
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    takeProfit: number;
    currentPrice: number;
    unrealizedPnL: number;
    pnlPercentage: number;
    entryTimestamp: number;
    lastUpdated: number;
    tradeSignature: string;
    status: PositionStatus;
    exitPrice?: number;
    exitTimestamp?: number;
    realizedPnL?: number;
    closeReason?: string;
    metadata: PositionMetadata;
}

export interface PositionMetadata {
    confidenceScore: number;
    initialStopLoss: number;
    initialTakeProfit: number;
    riskRewardRatio: number;
    maxDrawdown?: number;
    highestPrice?: number;
    lowestPrice?: number;
    volatility?: number;
}

export type PositionStatus = 'active' | 'closed' | 'force_closed';

export interface TradingSignal {
    tokenAddress: string;
    type: OrderType;
    price: number;
    quantity: number;
    confidence: number;
    stopLoss: number;
    takeProfit: number;
    timestamp: number;
    reason?: string;
    metadata?: {
        sentiment?: number;
        volatility?: number;
        holderScore?: number;
        technicalScore?: number;
    };
}

export type OrderType = 'entry' | 'exit';

export interface Trade {
    positionId: string;
    tokenAddress: string;
    type: OrderType;
    price: number;
    quantity: number;
    timestamp: number;
    signature: string;
    fees: number;
    slippage: number;
    realizedPnL?: number;
    pnlPercentage?: number;
}

export interface FailedTrade {
    tokenAddress: string;
    type: OrderType;
    price: number;
    quantity: number;
    timestamp: number;
    error: string;
    errorCode?: string;
}

export interface TradeExecutionResult {
    success: boolean;
    signature?: string;
    error?: string;
    timestamp: number;
    fees?: number;
    slippage?: number;
}

// Market Analysis Types
export interface MarketMetrics {
    price: number;
    volume24h: number;
    marketCap: number;
    volatility: number;
    liquidity: number;
    timestamp: number;
}

export interface TechnicalIndicators {
    rsi: number;
    macd: {
        macdLine: number;
        signalLine: number;
        histogram: number;
    };
    ema: {
        ema9: number;
        ema20: number;
        ema50: number;
    };
    bollingerBands: {
        upper: number;
        middle: number;
        lower: number;
    };
    timestamp: number;
}

// Risk Management Types
export interface RiskMetrics {
    maxDrawdown: number;
    sharpeRatio: number;
    sortingRatio: number;
    winRate: number;
    profitFactor: number;
    expectedValue: number;
}

export interface PortfolioMetrics {
    totalValue: number;
    pnl: number;
    pnlPercentage: number;
    openPositions: number;
    totalTrades: number;
    successfulTrades: number;
    failedTrades: number;
    averagePositionSize: number;
    largestPositionSize: number;
    averageHoldingTime: number;
}

// System Types
export interface SystemMetrics {
    memory: {
        heapUsed: string;
        heapTotal: string;
        rss: string;
    };
    cpu: {
        user: number;
        system: number;
    };
    timestamp: number;
}

// Error Types
export interface TradingError extends Error {
    code?: string;
    metadata?: any;
    originalError?: any;
}

// Event Types
export interface TradeEvent {
    type: 'positionOpened' | 'positionClosed' | 'positionUpdated' | 'tradeFailed';
    position?: Position;
    trade?: Trade;
    error?: Error;
    timestamp: number;
}

export interface AlertEvent {
    type: 'priceAlert' | 'volumeAlert' | 'volatilityAlert' | 'sentimentAlert';
    tokenAddress: string;
    metric: string;
    value: number;
    threshold: number;
    timestamp: number;
}

// Configuration Types
export interface TradingConfig {
    maxPositions: number;
    maxPositionSizeSOL: number;
    minPositionSizeSOL: number;
    stopLossPercentage: number;
    takeProfitPercentage: number;
    slippageBps: number;
    minConfidenceScore: number;
    monitoringInterval: number;
    positionSizePercentage: number;
    maxPositionSizePercentage: number;
    volatilityTPMultiplier: number;
    trailStopActivationPercentage: number;
    trailStopDistance: number;
    volatilityThreshold: number;
    positionStaleThreshold: number;
}

export interface APIConfig {
    port: number;
    host: string;
    apiKey: string;
    rateLimit: {
        windowMs: number;
        maxRequests: number;
    };
}

export interface DatabaseConfig {
    url: string;
    reconnectInterval: number;
    maxRetries: number;
}

export interface LoggingConfig {
    level: string;
    maxFiles: number;
    maxSize: number;
    path: string;
}

export interface MonitoringConfig {
    enabled: boolean;
    interval: number;
    metrics: string[];
}

// API Response Types
export interface APIResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: number;
}

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
}