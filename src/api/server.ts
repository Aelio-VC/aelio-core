import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { json } from 'body-parser';
import { Request, Response, NextFunction } from 'express';

import { Aelio } from '../core/Aelio';
import { authenticateApiKey } from './middleware.ts';
import { logger } from '../utils/logger';
import { config } from '../config/config';

class Server {
    private app: express.Application;
    private aelio: Aelio;
    private port: number;

    constructor() {
        this.app = express();
        this.port = config.server.port || 3000;
        this.aelio = new Aelio();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    private setupMiddleware(): void {
        // Security middleware
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(json());
        
        // Request logging
        this.app.use((req: Request, _res: Response, next: NextFunction) => {
            logger.info(`${req.method} ${req.path}`);
            next();
        });
    }

    private setupRoutes(): void {
        // Health check endpoint
        this.app.get('/health', (_req: Request, res: Response) => {
            res.status(200).json({ status: 'healthy' });
        });

        // Protected routes
        const apiRouter = express.Router();
        apiRouter.use(authenticateApiKey);

        // System control endpoints
        apiRouter.post('/start', async (_req: Request, res: Response) => {
            try {
                await this.aelio.start();
                res.status(200).json({ message: 'System started successfully' });
            } catch (error) {
                logger.error('Failed to start system:', error);
                res.status(500).json({ error: 'Failed to start system' });
            }
        });

        apiRouter.post('/stop', async (_req: Request, res: Response) => {
            try {
                await this.aelio.stop();
                res.status(200).json({ message: 'System stopped successfully' });
            } catch (error) {
                logger.error('Failed to stop system:', error);
                res.status(500).json({ error: 'Failed to stop system' });
            }
        });

        apiRouter.get('/status', (_req: Request, res: Response) => {
            const status = {
                isRunning: this.aelio.isRunning,
                timestamp: new Date().toISOString()
            };
            res.status(200).json(status);
        });

        // Mount the API router
        this.app.use('/api', apiRouter);

        // 404 handler
        this.app.use((_req: Request, res: Response) => {
            res.status(404).json({ error: 'Not found' });
        });
    }

    private setupErrorHandling(): void {
        this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
            logger.error('Unhandled error:', err);
            res.status(500).json({ error: 'Internal server error' });
        });

        // Handle uncaught exceptions and unhandled rejections
        process.on('uncaughtException', (error: Error) => {
            logger.error('Uncaught Exception:', error);
            this.gracefulShutdown();
        });

        process.on('unhandledRejection', (reason: any) => {
            logger.error('Unhandled Rejection:', reason);
            this.gracefulShutdown();
        });
    }

    private async gracefulShutdown(): Promise<void> {
        logger.info('Initiating graceful shutdown...');
        try {
            await this.aelio.stop();
            logger.info('Aelio system stopped successfully');
        } catch (error) {
            logger.error('Error stopping Aelio system:', error);
        }

        process.exit(1);
    }

    public async start(): Promise<void> {
        try {
            // Start the server
            this.app.listen(this.port, () => {
                logger.info(`Server listening on port ${this.port}`);
            });

            // Handle shutdown signals
            process.on('SIGTERM', () => this.gracefulShutdown());
            process.on('SIGINT', () => this.gracefulShutdown());
        } catch (error) {
            logger.error('Failed to start server:', error);
            throw error;
        }
    }
}

export default Server;