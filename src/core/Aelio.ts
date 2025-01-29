import { HeliusService } from '../services/helius';
import { AITrader } from '../ai/trader';
import { DatabaseService } from '../services/database';
import { logger } from '../utils/logger';
import { TradingEngine } from './TradingEngine';
import { EventEmitter } from 'events';
import { MarketMonitor } from './MarketMonitor';

export class Aelio extends EventEmitter {
	private heliusService: HeliusService;
	private aiTrader: AITrader;
	private dbService: DatabaseService;
	private marketMonitor: MarketMonitor;
	private tradingEngine: TradingEngine;
	private isRunning: boolean = false;

	constructor() {
		super();
		this.initializeServices();
	}

	private initializeServices() {
		try {
			this.dbService = new DatabaseService();
			this.heliusService = new HeliusService();
			this.aiTrader = new AITrader();
			this.marketMonitor = new MarketMonitor();
			this.tradingEngine = new TradingEngine(
				this.aiTrader,
				this.dbService,
				this.heliusService
			);

			this.setupEventListeners();
		} catch (error) {
			logger.error('Failed to initialize services:', error);
			throw error;
		}
	}

	private setupEventListeners() {
		this.marketMonitor.on('newTokenDiscovered', async (tokenData: any) => {
			try {
				await this.tradingEngine.evaluateTradeOpportunity(tokenData);
			} catch (error) {
				logger.error('Error evaluating trade opportunity:', error);
			}
		});

		this.tradingEngine.on('tradingSignal', async (signal: any) => {
			try {
				await this.executeTrade(signal);
			} catch (error) {
				logger.error('Error executing trade:', error);
			}
		});
	}

	private async executeTrade(signal: any) {
		try {
			await this.tradingEngine.executeTrade(signal);
			await this.dbService.saveTrade(signal);
		} catch (error) {
			logger.error('Failed to execute trade:', error);
		}
	}

	async start() {
		if (this.isRunning) {
			logger.warn('System is already running');
			return;
		}

		try {
			// Initialize database connection
			await this.dbService.connect();
			// Start trading engine
			await this.tradingEngine.start();

			this.isRunning = true;
			logger.info('All systems started successfully');
		} catch (error) {
			logger.error('Failed to start system:', error);
			throw error;
		}
	}

	async stop() {
		if (!this.isRunning) {
			logger.warn('System is not running');
			return;
		}

		try {
			await this.tradingEngine.stop();
			await this.dbService.disconnect();
			this.isRunning = false;
			logger.info('System stopped successfully');
		} catch (error) {
			logger.error('Error stopping system:', error);
			throw error;
		}
	}
}
