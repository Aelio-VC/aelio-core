import { EventEmitter } from 'events';
import { PublicKey, Connection, Transaction, sendAndConfirmTransaction, Keypair } from '@solana/web3.js';
import { Jupiter } from '@jup-ag/core';
import { AITrader } from '../ai/trader';
import { DatabaseService } from '../services/database';
import { HeliusService } from '../services/helius';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import {
	TokenData,
	TradingSignal,
	Position,
	TradeExecutionResult,
	OrderType,
	TradingError
} from '../types/types';

interface PositionConfig {
	maxPositions: number;
	maxPositionSizeSOL: number;
	minPositionSizeSOL: number;
	stopLossPercentage: number;
	takeProfitPercentage: number;
	slippageBps: number;
}

export class TradingEngine extends EventEmitter {
	private isRunning: boolean = false;
	private activePositions: Map<string, Position> = new Map();
	private jupiter: Jupiter;
	private connection: Connection;
	private positionConfig: PositionConfig;
	private wallet: Keypair;

	constructor(
		private aiTrader: AITrader,
		private dbService: DatabaseService,
		private heliusService: HeliusService
	) {
		super();
		this.initializeEngine();
	}

	private async initializeEngine() {
		try {
			// Initialize Solana connection
			this.connection = new Connection(config.helius.endpoint);

			// Initialize Jupiter
			this.jupiter = await Jupiter.load({
				connection: this.connection,
				cluster: 'mainnet-beta',
				user: this.wallet.publicKey,
			});

			// Load position configuration
			this.positionConfig = {
				maxPositions: config.trading.maxPositions,
				maxPositionSizeSOL: config.trading.maxPositionSizeSOL,
				minPositionSizeSOL: config.trading.minPositionSizeSOL,
				stopLossPercentage: config.trading.stopLossPercentage,
				takeProfitPercentage: config.trading.takeProfitPercentage,
				slippageBps: config.trading.slippageBps
			};

			// Initialize wallet from private key
			this.wallet = Keypair.fromSecretKey(
				Buffer.from(config.trading.privateKey, 'hex')
			);

		} catch (error) {
			logger.error('Failed to initialize trading engine:', error);
			throw new Error('Trading engine initialization failed');
		}
	}

	async start() {
		if (this.isRunning) {
			logger.warn('Trading engine is already running');
			return;
		}

		try {
			this.isRunning = true;
			await this.loadActivePositions();
			this.startPositionMonitoring();
			logger.info('Trading engine started successfully');
		} catch (error) {
			this.isRunning = false;
			logger.error('Failed to start trading engine:', error);
			throw error;
		}
	}

	async stop() {
		try {
			this.isRunning = false;
			// Close all active positions if configured to do so
			if (config.trading.closePositionsOnShutdown) {
				await this.closeAllPositions('shutdown');
			}
			logger.info('Trading engine stopped successfully');
		} catch (error) {
			logger.error('Error stopping trading engine:', error);
			throw error;
		}
	}

	private async loadActivePositions() {
		try {
			const positions = await this.dbService.getActivePositions();
			for (const position of positions) {
				this.activePositions.set(position.tokenAddress, position);
				await this.validatePosition(position); // Validate each position on load
			}
			logger.info(`Loaded ${positions.length} active positions`);
		} catch (error) {
			logger.error('Error loading active positions:', error);
			throw error;
		}
	}

	private async validatePosition(position: Position) {
		try {
			const currentPrice = await this.heliusService.getTokenPrice(position.tokenAddress);

			// Check if position data is stale
			if (Date.now() - position.lastUpdated > config.trading.positionStaleThreshold) {
				await this.updatePositionData(position);
			}

			// Validate stop-loss and take-profit levels
			if (position.stopLoss > currentPrice || position.takeProfit < currentPrice) {
				logger.warn(`Invalid SL/TP levels for position ${position.tokenAddress}, adjusting...`);
				await this.adjustPositionLevels(position, currentPrice);
			}
		} catch (error) {
			logger.error(`Error validating position ${position.tokenAddress}:`, error);
			throw error;
		}
	}

	private startPositionMonitoring() {
		setInterval(async () => {
			if (!this.isRunning) return;

			try {
				await this.monitorPositions();
			} catch (error) {
				logger.error('Error in position monitoring:', error);
			}
		}, config.trading.monitoringInterval);
	}

	private async monitorPositions() {
		const positionPromises = Array.from(this.activePositions.values()).map(
			async (position) => {
				try {
					const currentPrice = await this.heliusService.getTokenPrice(position.tokenAddress);
					await this.updatePositionMetrics(position, currentPrice);
					await this.checkPositionStatus(position, currentPrice);
				} catch (error) {
					logger.error(`Error monitoring position ${position.tokenAddress}:`, error);
				}
			}
		);

		await Promise.allSettled(positionPromises);
	}

	private async updatePositionMetrics(position: Position, currentPrice: number) {
		try {
			const unrealizedPnL = (currentPrice - position.entryPrice) * position.quantity;
			const pnlPercentage = (currentPrice - position.entryPrice) / position.entryPrice * 100;

			const updatedPosition = {
				...position,
				currentPrice,
				unrealizedPnL,
				pnlPercentage,
				lastUpdated: Date.now()
			};

			this.activePositions.set(position.tokenAddress, updatedPosition);
			await this.dbService.updatePosition(updatedPosition);

			// Emit position update event
			this.emit('positionUpdate', updatedPosition);
		} catch (error) {
			logger.error(`Error updating position metrics for ${position.tokenAddress}:`, error);
			throw error;
		}
	}

	private async checkPositionStatus(position: Position, currentPrice: number) {
		try {
			// Check stop-loss
			if (currentPrice <= position.stopLoss) {
				await this.closePosition(position, 'stopLoss');
				return;
			}

			// Check take-profit
			if (currentPrice >= position.takeProfit) {
				await this.closePosition(position, 'takeProfit');
				return;
			}

			// Dynamic position management
			await this.manageDynamicPositionLevels(position, currentPrice);
		} catch (error) {
			logger.error(`Error checking position status for ${position.tokenAddress}:`, error);
			throw error;
		}
	}

	private async manageDynamicPositionLevels(position: Position, currentPrice: number) {
		try {
			const pnlPercentage = (currentPrice - position.entryPrice) / position.entryPrice * 100;

			// Trail stop-loss if in profit
			if (pnlPercentage > config.trading.trailStopActivationPercentage) {
				const newStopLoss = currentPrice * (1 - config.trading.trailStopDistance);
				if (newStopLoss > position.stopLoss) {
					await this.updateStopLoss(position, newStopLoss);
				}
			}

			// Adjust take-profit based on volatility
			const volatility = await this.calculateVolatility(position.tokenAddress);
			if (volatility > config.trading.volatilityThreshold) {
				const newTakeProfit = this.calculateDynamicTakeProfit(position, volatility);
				await this.updateTakeProfit(position, newTakeProfit);
			}
		} catch (error) {
			logger.error(`Error managing dynamic position levels for ${position.tokenAddress}:`, error);
			throw error;
		}
	}

	private async calculateVolatility(tokenAddress: string): Promise<number> {
		try {
			const prices = await this.heliusService.getHistoricalPrices(tokenAddress);
			const returns = [];

			for (let i = 1; i < prices.length; i++) {
				returns.push(Math.log(prices[i] / prices[i - 1]));
			}

			const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
			const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;

			return Math.sqrt(variance);
		} catch (error) {
			logger.error(`Error calculating volatility for ${tokenAddress}:`, error);
			throw error;
		}
	}

	async evaluateTradeOpportunity(tokenData: TokenData) {
		try {
			// Check if we can take new positions
			if (this.activePositions.size >= this.positionConfig.maxPositions) {
				logger.info('Maximum number of positions reached, skipping evaluation');
				return;
			}

			// Get AI trading signal
			const signal = await this.aiTrader.evaluateToken(tokenData);

			if (signal.confidence >= config.trading.minConfidenceScore) {
				// Calculate position size
				const positionSize = await this.calculatePositionSize(tokenData, signal);

				if (positionSize === 0) {
					logger.info('Position size calculation returned 0, skipping trade');
					return;
				}

				// Create trading signal
				const tradingSignal: TradingSignal = {
					tokenAddress: tokenData.address,
					type: 'entry',
					price: tokenData.price,
					quantity: positionSize,
					confidence: signal.confidence,
					stopLoss: this.calculateStopLoss(tokenData.price, 'long'),
					takeProfit: this.calculateTakeProfit(tokenData.price, 'long'),
					timestamp: Date.now()
				};

				// Emit trading signal
				this.emit('tradingSignal', tradingSignal);
			}
		} catch (error) {
			logger.error('Error evaluating trade opportunity:', error);
			throw error;
		}
	}

	private async calculatePositionSize(
		tokenData: TokenData,
		signal: { confidence: number }
	): Promise<number> {
		try {
			// Get account balance
			const balance = await this.connection.getBalance(this.wallet.publicKey);
			const balanceInSOL = balance / 1e9;

			// Calculate base position size based on account size and risk
			let positionSize = balanceInSOL * config.trading.positionSizePercentage;

			// Adjust based on confidence score
			positionSize *= signal.confidence;

			// Apply limits
			positionSize = Math.min(
				positionSize,
				this.positionConfig.maxPositionSizeSOL,
				balanceInSOL * config.trading.maxPositionSizePercentage
			);
			positionSize = Math.max(positionSize, this.positionConfig.minPositionSizeSOL);

			return positionSize;
		} catch (error) {
			logger.error('Error calculating position size:', error);
			throw error;
		}
	}

	async executeTrade(signal: TradingSignal): Promise<TradeExecutionResult> {
		try {
			// Validate trading signal
			await this.validateTradingSignal(signal);

			// Prepare the trade
			const quoteResponse = await this.prepareTradeQuote(signal);

			// Execute the trade
			const result = await this.executeTradeOnDex(quoteResponse);

			// Handle successful trade
			if (result.success) {
				await this.handleSuccessfulTrade(signal, result);
				return result;
			} else {
				throw new TradingError('Trade execution failed', result.error);
			}
		} catch (error) {
			logger.error('Error executing trade:', error);
			await this.handleFailedTrade(signal, error);
			throw error;
		}
	}

	private async prepareTradeQuote(signal: TradingSignal) {
		try {
			const routes = await this.jupiter.computeRoutes({
				inputMint: new PublicKey(config.tokens.SOL_MINT),
				outputMint: new PublicKey(signal.tokenAddress),
				amount: signal.quantity * 1e9, // Convert SOL to lamports
				slippageBps: this.positionConfig.slippageBps,
				forceFetch: true
			});

			if (routes.routesInfos.length === 0) {
				throw new Error('No routes found for trade');
			}

			// Select the best route
			const bestRoute = routes.routesInfos[0];

			return await this.jupiter.exchange({
				route: bestRoute,
				userPublicKey: this.wallet.publicKey
			});
		} catch (error) {
			logger.error('Error preparing trade quote:', error);
			throw error;
		}
	}

	private async executeTradeOnDex(quoteResponse: any): Promise<TradeExecutionResult> {
		try {
			const { transactions } = quoteResponse;
			const { setupTransaction, swapTransaction, cleanupTransaction } = transactions;

			// Send setup transaction if it exists
			if (setupTransaction) {
				const setupTx = Transaction.from(Buffer.from(setupTransaction));
				await sendAndConfirmTransaction(this.connection, setupTx, [this.wallet]);
			}

			// Send swap transaction
			const swapTx = Transaction.from(Buffer.from(swapTransaction));
			const signature = await sendAndConfirmTransaction(
				this.connection,
				swapTx,
				[this.wallet]
			);

			// Send cleanup transaction if it exists
			if (cleanupTransaction) {
				const cleanupTx = Transaction.from(Buffer.from(cleanupTransaction));
				await sendAndConfirmTransaction(this.connection, cleanupTx, [this.wallet]);
			}

			return {
				success: true,
				signature,
				timestamp: Date.now()
			};
		} catch (error) {
			logger.error('Error executing trade on DEX:', error);
			return {
				success: false,
				error: error.message,
				timestamp: Date.now()
			};
		}
	}


	private async handleSuccessfulTrade(signal: TradingSignal, result: TradeExecutionResult) {
		try {
			// Create new position
			const position: Position = {
				id: crypto.randomUUID(),
				tokenAddress: signal.tokenAddress,
				entryPrice: signal.price,
				quantity: signal.quantity,
				stopLoss: signal.stopLoss,
				takeProfit: signal.takeProfit,
				currentPrice: signal.price,
				unrealizedPnL: 0,
				pnlPercentage: 0,
				entryTimestamp: Date.now(),
				lastUpdated: Date.now(),
				tradeSignature: result.signature,
				status: 'active',
				metadata: {
					confidenceScore: signal.confidence,
					initialStopLoss: signal.stopLoss,
					initialTakeProfit: signal.takeProfit,
					riskRewardRatio: (signal.takeProfit - signal.price) / (signal.price - signal.stopLoss)
				}
			};

			// Save position to database
			await this.dbService.savePosition(position);

			// Add to active positions map
			this.activePositions.set(position.tokenAddress, position);

			// Save trade history
			await this.dbService.saveTrade({
				positionId: position.id,
				tokenAddress: signal.tokenAddress,
				type: 'entry',
				price: signal.price,
				quantity: signal.quantity,
				timestamp: Date.now(),
				signature: result.signature,
				fees: result.fees || 0,
				slippage: result.slippage || 0
			});

			// Emit position opened event
			this.emit('positionOpened', position);

			logger.info(`Successfully opened position for ${signal.tokenAddress}`, {
				positionId: position.id,
				entryPrice: position.entryPrice,
				quantity: position.quantity
			});

			// Start position-specific monitoring if needed
			await this.initializePositionMonitoring(position);
		} catch (error) {
			logger.error('Error handling successful trade:', error);
			throw new TradingError('Failed to process successful trade', error);
		}
	}

	private async initializePositionMonitoring(position: Position) {
		try {
			// Set up position-specific alerts
			await this.setupPriceAlerts(position);

			// Initialize dynamic management parameters
			await this.initializeDynamicManagement(position);

			// Set up volatility monitoring
			await this.setupVolatilityMonitoring(position);
		} catch (error) {
			logger.error(`Error initializing position monitoring for ${position.tokenAddress}:`, error);
			throw error;
		}
	}

	private async handleFailedTrade(signal: TradingSignal, error: any) {
		try {
			// Log failed trade attempt
			await this.dbService.saveFailedTrade({
				tokenAddress: signal.tokenAddress,
				type: signal.type,
				price: signal.price,
				quantity: signal.quantity,
				timestamp: Date.now(),
				error: error.message,
				errorCode: error.code
			});

			// Emit trade failed event
			this.emit('tradeFailed', {
				signal,
				error: error.message,
				timestamp: Date.now()
			});

			logger.error(`Trade failed for ${signal.tokenAddress}:`, error);
		} catch (dbError) {
			logger.error('Error logging failed trade:', dbError);
		}
	}

	private async closePosition(position: Position, reason: 'stopLoss' | 'takeProfit' | 'manual' | 'shutdown') {
		try {
			logger.info(`Closing position ${position.id} for ${reason}`);

			// Get current market price
			const currentPrice = await this.heliusService.getTokenPrice(position.tokenAddress);

			// Prepare exit signal
			const exitSignal: TradingSignal = {
				tokenAddress: position.tokenAddress,
				type: 'exit',
				price: currentPrice,
				quantity: position.quantity,
				confidence: 1, // Max confidence for exits
				timestamp: Date.now(),
				reason
			};

			// Execute exit trade
			const result = await this.executeTrade(exitSignal);

			if (result.success) {
				await this.handleSuccessfulClose(position, exitSignal, result, reason);
			} else {
				throw new TradingError('Failed to close position', result.error);
			}
		} catch (error) {
			logger.error(`Error closing position ${position.id}:`, error);

			// If it's a critical error during shutdown, force close the position
			if (reason === 'shutdown') {
				await this.forceClosePosition(position);
			} else {
				throw error;
			}
		}
	}

	private async handleSuccessfulClose(
		position: Position,
		exitSignal: TradingSignal,
		result: TradeExecutionResult,
		reason: string
	) {
		try {
			// Calculate final P&L
			const realizedPnL = (exitSignal.price - position.entryPrice) * position.quantity;
			const pnlPercentage = (realizedPnL / (position.entryPrice * position.quantity)) * 100;

			// Update position status
			const closedPosition = {
				...position,
				status: 'closed',
				exitPrice: exitSignal.price,
				exitTimestamp: Date.now(),
				realizedPnL,
				pnlPercentage,
				closeReason: reason
			};

			// Save to database
			await this.dbService.updatePosition(closedPosition);
			await this.dbService.saveTrade({
				positionId: position.id,
				tokenAddress: position.tokenAddress,
				type: 'exit',
				price: exitSignal.price,
				quantity: position.quantity,
				timestamp: Date.now(),
				signature: result.signature,
				fees: result.fees || 0,
				slippage: result.slippage || 0,
				realizedPnL,
				pnlPercentage
			});

			// Remove from active positions
			this.activePositions.delete(position.tokenAddress);

			// Emit position closed event
			this.emit('positionClosed', {
				position: closedPosition,
				reason,
				result
			});

			logger.info(`Successfully closed position ${position.id}`, {
				reason,
				realizedPnL,
				pnlPercentage
			});
		} catch (error) {
			logger.error(`Error handling successful position close for ${position.id}:`, error);
			throw error;
		}
	}

	private async forceClosePosition(position: Position) {
		try {
			// Log forced close
			logger.warn(`Force closing position ${position.id}`);

			// Update position status in database
			await this.dbService.updatePosition({
				...position,
				status: 'force_closed',
				exitTimestamp: Date.now(),
				closeReason: 'force_close'
			});

			// Remove from active positions
			this.activePositions.delete(position.tokenAddress);

			// Emit force close event
			this.emit('positionForceClosed', {
				position,
				timestamp: Date.now()
			});
		} catch (error) {
			logger.error(`Error force closing position ${position.id}:`, error);
			throw error;
		}
	}

	private async closeAllPositions(reason: 'shutdown' | 'emergency') {
		const closePromises = Array.from(this.activePositions.values()).map(
			async (position) => {
				try {
					await this.closePosition(position, reason);
				} catch (error) {
					logger.error(`Error closing position ${position.id} during ${reason}:`, error);
					// Force close if normal close fails during shutdown
					await this.forceClosePosition(position);
				}
			}
		);

		await Promise.allSettled(closePromises);
	}

	private async setupPriceAlerts(position: Position) {
		// Implementation of price alert setup
		// This could involve websocket connections or polling depending on your infrastructure
	}

	private async initializeDynamicManagement(position: Position) {
		// Implementation of dynamic position management initialization
		// This could involve setting up trailing stops, dynamic take-profit levels, etc.
	}

	private async setupVolatilityMonitoring(position: Position) {
		// Implementation of volatility monitoring
		// This could involve calculating and tracking volatility metrics
	}

	// Helper methods for risk management and position sizing
	private calculateStopLoss(entryPrice: number, direction: 'long' | 'short'): number {
		const stopLossPercent = this.positionConfig.stopLossPercentage;
		return direction === 'long'
			? entryPrice * (1 - stopLossPercent)
			: entryPrice * (1 + stopLossPercent);
	}

	private calculateTakeProfit(entryPrice: number, direction: 'long' | 'short'): number {
		const takeProfitPercent = this.positionConfig.takeProfitPercentage;
		return direction === 'long'
			? entryPrice * (1 + takeProfitPercent)
			: entryPrice * (1 - takeProfitPercent);
	}

	private calculateDynamicTakeProfit(position: Position, volatility: number): number {
		// Implementation of dynamic take-profit calculation based on volatility
		const baseTP = position.entryPrice * (1 + this.positionConfig.takeProfitPercentage);
		const volatilityAdjustment = volatility * config.trading.volatilityTPMultiplier;
		return baseTP * (1 + volatilityAdjustment);
	}
}