import mongoose, { Schema, Document } from 'mongoose';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import {
    Position,
    TokenData,
    Trade,
    FailedTrade,
    TradingSignal
} from '../types/types';

// Schemas
const TokenSchema = new Schema({
    address: { type: String, required: true, unique: true },
    symbol: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    volume24h: { type: Number, required: true },
    holders: [{
        address: String,
        balance: Number,
        tradingScore: Number
    }],
    sentimentScore: Number,
    marketCap: Number,
    supply: Number,
    decimals: Number,
    holderCount: Number,
    riskScore: Number,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const PositionSchema = new Schema({
    id: { type: String, required: true, unique: true },
    tokenAddress: { type: String, required: true },
    entryPrice: { type: Number, required: true },
    quantity: { type: Number, required: true },
    stopLoss: { type: Number, required: true },
    takeProfit: { type: Number, required: true },
    currentPrice: { type: Number, required: true },
    unrealizedPnL: { type: Number, required: true },
    pnlPercentage: { type: Number, required: true },
    entryTimestamp: { type: Date, required: true },
    lastUpdated: { type: Date, required: true },
    tradeSignature: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['active', 'closed', 'force_closed'],
        required: true 
    },
    exitPrice: Number,
    exitTimestamp: Date,
    realizedPnL: Number,
    closeReason: String,
    metadata: {
        confidenceScore: Number,
        initialStopLoss: Number,
        initialTakeProfit: Number,
        riskRewardRatio: Number
    }
});

const TradeSchema = new Schema({
    positionId: { type: String, required: true },
    tokenAddress: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['entry', 'exit'],
        required: true 
    },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    timestamp: { type: Date, required: true },
    signature: { type: String, required: true },
    fees: { type: Number, required: true },
    slippage: { type: Number, required: true },
    realizedPnL: Number,
    pnlPercentage: Number
});

const FailedTradeSchema = new Schema({
    tokenAddress: { type: String, required: true },
    type: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    timestamp: { type: Date, required: true },
    error: { type: String, required: true },
    errorCode: String
});

// Models
const Token = mongoose.model('Token', TokenSchema);
const Position = mongoose.model('Position', PositionSchema);
const Trade = mongoose.model('Trade', TradeSchema);
const FailedTrade = mongoose.model('FailedTrade', FailedTradeSchema);

export class DatabaseService {
    private isConnected: boolean = false;

    constructor() {
        mongoose.connection.on('error', this.handleConnectionError);
        mongoose.connection.on('disconnected', this.handleDisconnection);
    }

    async connect(): Promise<void> {
        if (this.isConnected) {
            logger.warn('Database is already connected');
            return;
        }

        try {
            await mongoose.connect(config.database.url, {
                retryWrites: true,
                w: 'majority'
            });
            this.isConnected = true;
            logger.info('Successfully connected to database');
        } catch (error) {
            logger.error('Failed to connect to database:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (!this.isConnected) {
            logger.warn('Database is not connected');
            return;
        }

        try {
            await mongoose.disconnect();
            this.isConnected = false;
            logger.info('Successfully disconnected from database');
        } catch (error) {
            logger.error('Error disconnecting from database:', error);
            throw error;
        }
    }

    private handleConnectionError = (error: Error): void => {
        logger.error('Database connection error:', error);
        this.isConnected = false;
    };

    private handleDisconnection = (): void => {
        logger.warn('Database disconnected');
        this.isConnected = false;
        this.attemptReconnection();
    };

    private attemptReconnection = async (): Promise<void> => {
        try {
            await this.connect();
        } catch (error) {
            logger.error('Failed to reconnect to database:', error);
            setTimeout(this.attemptReconnection, config.database.reconnectInterval);
        }
    };

    // Token operations
    async saveToken(tokenData: TokenData): Promise<void> {
        try {
            await Token.findOneAndUpdate(
                { address: tokenData.address },
                tokenData,
                { upsert: true, new: true }
            );
        } catch (error) {
            logger.error('Error saving token:', error);
            throw error;
        }
    }

    async getToken(address: string): Promise<TokenData | null> {
        try {
            return await Token.findOne({ address });
        } catch (error) {
            logger.error('Error getting token:', error);
            throw error;
        }
    }

    async tokenExists(address: string): Promise<boolean> {
        try {
            const count = await Token.countDocuments({ address });
            return count > 0;
        } catch (error) {
            logger.error('Error checking token existence:', error);
            throw error;
        }
    }

    // Position operations
    async savePosition(position: Position): Promise<void> {
        try {
            await Position.create(position);
        } catch (error) {
            logger.error('Error saving position:', error);
            throw error;
        }
    }

    async updatePosition(position: Position): Promise<void> {
        try {
            await Position.findOneAndUpdate(
                { id: position.id },
                position,
                { new: true }
            );
        } catch (error) {
            logger.error('Error updating position:', error);
            throw error;
        }
    }

    async getActivePositions(): Promise<Position[]> {
        try {
            return await Position.find({ status: 'active' });
        } catch (error) {
            logger.error('Error getting active positions:', error);
            throw error;
        }
    }

    async getPosition(id: string): Promise<Position | null> {
        try {
            return await Position.findOne({ id });
        } catch (error) {
            logger.error('Error getting position:', error);
            throw error;
        }
    }

    // Trade operations
    async saveTrade(trade: Trade): Promise<void> {
        try {
            await Trade.create(trade);
        } catch (error) {
            logger.error('Error saving trade:', error);
            throw error;
        }
    }

    async saveFailedTrade(failedTrade: FailedTrade): Promise<void> {
        try {
            await FailedTrade.create(failedTrade);
        } catch (error) {
            logger.error('Error saving failed trade:', error);
            throw error;
        }
    }

    async getTradesByPosition(positionId: string): Promise<Trade[]> {
        try {
            return await Trade.find({ positionId });
        } catch (error) {
            logger.error('Error getting trades by position:', error);
            throw error;
        }
    }

    // Analytics operations
    async getTradeHistory(
        startTime: Date,
        endTime: Date
    ): Promise<Trade[]> {
        try {
            return await Trade.find({
                timestamp: { $gte: startTime, $lte: endTime }
            }).sort({ timestamp: 1 });
        } catch (error) {
            logger.error('Error getting trade history:', error);
            throw error;
        }
    }

    async getPerformanceMetrics(
        startTime: Date,
        endTime: Date
    ): Promise<any> {
        try {
            const trades = await Trade.find({
                timestamp: { $gte: startTime, $lte: endTime }
            });

            const totalTrades = trades.length;
            const profitableTrades = trades.filter(t => t.realizedPnL > 0).length;
            const totalPnL = trades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
            const winRate = totalTrades > 0 ? profitableTrades / totalTrades : 0;

            return {
                totalTrades,
                profitableTrades,
                totalPnL,
                winRate
            };
        } catch (error) {
            logger.error('Error getting performance metrics:', error);
            throw error;
        }
    }
}