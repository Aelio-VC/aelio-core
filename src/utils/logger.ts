// src/utils/logger.ts
import winston from 'winston';
import { config } from '../config/config';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
	let log = `${timestamp} [${level}]: ${message}`;

	// Add metadata if present
	if (Object.keys(metadata).length > 0) {
		log += ` ${JSON.stringify(metadata)}`;
	}

	// Add stack trace for errors
	if (stack) {
		log += `\n${stack}`;
	}

	return log;
});

// Create logger instance
export const logger = winston.createLogger({
	level: config.logging.level || 'info',
	format: combine(
		timestamp(),
		errors({ stack: true }),
		logFormat
	),
	transports: [
		// Console transport
		new winston.transports.Console({
			format: combine(
				colorize(),
				logFormat
			)
		}),
		// File transport for errors
		new winston.transports.File({
			filename: 'logs/error.log',
			level: 'error',
			maxsize: 5242880, // 5MB
			maxFiles: 5
		}),
		// File transport for all logs
		new winston.transports.File({
			filename: 'logs/combined.log',
			maxsize: 5242880, // 5MB
			maxFiles: 5
		})
	]
});

// Add request logging middleware
export const requestLogger = (req: any, res: any, next: any) => {
	const start = Date.now();

	res.on('finish', () => {
		const duration = Date.now() - start;
		logger.info('Request processed', {
			method: req.method,
			url: req.url,
			status: res.statusCode,
			duration: `${duration}ms`
		});
	});

	next();
};

// Error logging middleware
export const errorLogger = (err: Error, req: any, res: any, next: any) => {
	logger.error('Request error', {
		error: err.message,
		stack: err.stack,
		method: req.method,
		url: req.url
	});
	next(err);
};

// Custom error handler
class CustomError extends Error {
	constructor(
		message: string,
		public readonly code?: string,
		public readonly metadata?: any
	) {
		super(message);
		this.name = this.constructor.name;
		Error.captureStackTrace(this, this.constructor);
	}
}

// Trading specific error
export class TradingError extends CustomError {
	constructor(
		message: string,
		public readonly originalError?: any
	) {
		super(message);
		this.name = 'TradingError';
	}
}

// Logger wrapper for consistent error handling
export const logError = (error: Error | CustomError, context?: string) => {
	const errorInfo: any = {
		message: error.message,
		name: error.name,
		stack: error.stack
	};

	if (error instanceof CustomError) {
		if (error.code) errorInfo.code = error.code;
		if (error.metadata) errorInfo.metadata = error.metadata;
	}

	if (context) errorInfo.context = context;

	logger.error('Error occurred', errorInfo);
};

// Performance monitoring
export const logPerformance = (
	operation: string,
	duration: number,
	metadata?: any
) => {
	logger.info('Performance metric', {
		operation,
		duration: `${duration}ms`,
		...metadata
	});
};

// System monitoring
export const monitorSystem = () => {
	const used = process.memoryUsage();
	logger.info('System metrics', {
		memory: {
			heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
			heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
			rss: `${Math.round(used.rss / 1024 / 1024)}MB`
		},
		cpu: process.cpuUsage()
	});
};

// Start periodic system monitoring
if (config.monitoring.enabled) {
	setInterval(monitorSystem, config.monitoring.interval);
}