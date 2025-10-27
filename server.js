import express from 'express';
import http from 'http'; // ✅ needed for socket.io
import { Server } from 'socket.io'; // ✅
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { testConnection } from './config/database.js';
import authRoutes from './routes/auth.js';
import facebookRoutes from './routes/facebook.js';
import ghlRoutes from './routes/ghl.js';
import { getFacebookAccounts,getAccountsForLoginWatcher } from './models/FacebookAccount.js';
import { sendMessage, scrapeSingleChat, scrapeChatList, scrapeAllChats, watcher, schedular, errorWatcher,processPendingAccounts } from './services/scrapeMarketplaceMessages.js';
import { getLastMessage,updateMessageIndex } from './models/Message.js';
import messageRouter from "./routes/message.js"; // adjust path if different
import { authenticateToken } from './middleware/auth.js';
import conversationRouter from './routes/conversation.js';
import scrapeRoutes from "./routes/scrapeRoutes.js";
import { setSocketIO as setScraperSocket } from "./workers/scraperWorker.js";
import { setSocketIO as setLoginSocket } from "./workers/loginWorker.js";
import { setSocketIO } from "./workers/scraperWorker.js"; // 👈 add this
import { scrapeQueue } from "./queues/scrapeQueue.js";
import { loginQueue } from "./queues/loginQueue.js";
import { appendToConversations } from './models/conversations.js';
import {setup} from "./services/setup.js"
import cron from 'node-cron';
import { loginFacebookAccount, watcherForLogin } from './services/puppeteerLogin.js';
import './workers/setupWorker.js'; // 👈 This starts the setupQueue worker
import { decrypt } from './utils/encryption.js';

// import {runPuppeteerScript}  from './test.js'
dotenv.config();

const app = express()
const port = process.env.PORT || 3000;
const server = http.createServer(app);
// ✅ Attach socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // or restrict to frontend domain in production
  },
});
setSocketIO(io);
setScraperSocket(io);
setLoginSocket(io);
app.set('trust proxy', 1);

// Security middleware 
app.use(helmet());
//  uncomment it on production
//app.use(cors({
//   origin: process.env.NODE_ENV === 'production'
//     ? [`${process.env.ORIGIN_1}`, 'http://localhost:3000', 'http://localhost:3001']
//     : ['http://localhost:3000', 'http://localhost:3001'],
//   credentials: true
// }));
app.use(cors({
  origin: '*',
  // credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { error: 'Too many requests, please try again later' }
});

// Special rate limiting for webhooks (more permissive)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // Allow more requests for webhooks
  message: {
    error: 'Webhook rate limit exceeded'
  }
});
app.use('/webhooks', express.raw({ type: 'application/json' }));

app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.get('/pup-login',async (req, res) => {
  let test=await loginFacebookAccount(1);
   res.json(test)
})
// Health check endpoint
app.get('/health', async (req, res) => {
  const dbStatus = await testConnection();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbStatus ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV
  });
});
app.get('/testt', async (req, res) => {
  res.json(await appendToConversations(1, "https://www.facebook.com/messages/t/24452627391033013/"));
})
app.get('/test-scraper', async (req, res) => {
  try {
    const data = await scrapeSingleChat(189, ["https://www.facebook.com/messages/t/25116679787935354/"]);
    // const data = await sendMessage(1);
    // const data = await scrapeMarketplaceMessagesTest(1);
    // const data = await scrapeAllChats(1, true);
    // const data = await scrapeAllChats(97);
    // 
    // const data = await scrapeChatList(170);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/test-query', async (req, res) => {
  try {
    const id = req.query.id;
    const data = await getLastMessage(id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Basic routes
app.get('/', (req, res) => {
  res.json({
    message: 'Facebook-GHL Integration API',
    version: '1.0.0',
    status: 'running'
  });
});
app.get('/acc', getFacebookAccounts);
app.get('/test1', async (req, res) => {
  // res.json(await getAccountsForLoginWatcher(1))
  // res.json(decrypt("6cea4b75cc5b9b750d8e82ebf8e962db"))
  res.json(await updateMessageIndex("https://www.facebook.com/messages/t/24452627391033013/", "hello"))
  // res.json(await errorWatcher())
});
app.use('/api/auth', authRoutes);
app.use('/api/facebook', authenticateToken, facebookRoutes);
app.use('/api/g_h_l', ghlRoutes);
app.use('/api/messages', messageRouter);
app.use('/api/chats', conversationRouter);
app.use("/api/scrape", scrapeRoutes);
app.get('/watcher', async (req, res) => {
  let data = await watcher();
  console.log(data.length)
  res.json(data)
})
app.get('/setup',async (req, res) => {
  const test= await setup();
  res.json(test);
})
app.get('/sch', async (req, res) => {
  let data = await schedular();
  // console.log(data.length)
  res.json(data)
})
// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('Cannot start server: Database connection failed');
      process.exit(1);
    }
    server.listen(port, () => {
      console.log(` Server running on port ${port}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(` Health check: http://localhost:${port}/health`);
      // Start the token refresh cron job 
      // startTokenRefreshJob();
    });
    (async () => {
      await scrapeQueue.clean(0, "completed");
      await scrapeQueue.clean(0, "failed");   // if you don’t want failed jobs either
      await loginQueue.clean(0, "completed");
      console.log("✅ Old jobs cleaned up at startup");
    })();
    // cron.schedule('0 0 */2 * * *', async () => {
    //   console.log(`[CRON] Running watcher and scheduler at ${new Date().toISOString()}`);
    //   try {
    //     await watcherForLogin();
      
    //   } catch (error) {
    //     console.error('[CRON ERROR]', error.message);
    //   }
    // })
//  cron.schedule('*/2 * * * *', async () => {
//   console.log(`[CRON] Running watcher and scheduler at ${new Date().toISOString()}`);
//   try {
//     await watcher();
//     await schedular();
//     await errorWatcher();
//     await processPendingAccounts();
//   } catch (error) {
//     console.error('[CRON ERROR]', error.message);
//   }
// });

  } catch (error) {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  }
};

startServer();
