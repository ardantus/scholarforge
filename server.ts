import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { db } from './src/db/index.ts';
import { journals, submissions, users, versions } from './src/db/schema.ts';
import { eq, desc } from 'drizzle-orm';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { performPreFlightCheck, anonymizeManuscript } from './src/lib/gemini.ts';
import { setupWSConnection } from 'y-websocket/bin/utils';
import { createServer as createViteServer } from 'vite';
import PDFDocument from 'pdfkit';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json());

  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // WebSocket Upgrade Handling for Yjs
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const roomName = url.pathname.slice(4); // Remove /ws/
    setupWSConnection(ws, req, { docName: roomName });
  });

  // API Routes
  app.get('/api/journals', async (req, res) => {
    try {
      const allJournals = await db.select().from(journals);
      res.json(allJournals);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch journals' });
    }
  });

  app.get('/api/submissions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userSubmissions = await db.select()
        .from(submissions)
        .where(eq(submissions.authorId, req.user!.dbId))
        .orderBy(desc(submissions.updatedAt));
      res.json(userSubmissions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch submissions' });
    }
  });

  app.post('/api/submissions', requireAuth, async (req: AuthRequest, res) => {
    const { title, journalId, abstract } = req.body;
    try {
      const [newSubmission] = await db.insert(submissions)
        .values({
          title,
          journalId,
          abstract,
          authorId: req.user!.dbId,
          content: {}, // Initial empty content
        })
        .returning();
      res.json(newSubmission);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create submission' });
    }
  });

  app.get('/api/submissions/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const [submission] = await db.select()
        .from(submissions)
        .where(eq(submissions.id, req.params.id));
      
      if (!submission) return res.status(404).json({ error: 'Not found' });
      
      // Authorization check
      if (submission.authorId !== req.user!.dbId && req.user!.role !== 'admin' && req.user!.role !== 'editor') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      res.json(submission);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch submission' });
    }
  });

  app.post('/api/submissions/:id/pre-flight', requireAuth, async (req: AuthRequest, res) => {
    try {
      const [submission] = await db.select()
        .from(submissions)
        .where(eq(submissions.id, req.params.id));

      if (!submission) return res.status(404).json({ error: 'Not found' });

      const checkResult = await performPreFlightCheck(
        submission.title,
        submission.abstract || '',
        JSON.stringify(submission.content || {})
      );

      await db.update(submissions)
        .set({ metadata: { ...((submission.metadata as object) || {}), preFlight: checkResult } })
        .where(eq(submissions.id, req.params.id));

      res.json(checkResult);
    } catch (error) {
      res.status(500).json({ error: 'Pre-flight check failed' });
    }
  });

  app.post('/api/submissions/:id/anonymize', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { content } = req.body;
      const anonymizedText = await anonymizeManuscript(content);
      res.json({ content: anonymizedText });
    } catch (error) {
      res.status(500).json({ error: 'Anonymization failed' });
    }
  });

  app.post('/api/submissions/:id/typeset', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { content } = req.body;
      const [submission] = await db.select()
        .from(submissions)
        .where(eq(submissions.id, req.params.id));

      if (!submission) return res.status(404).json({ error: 'Not found' });

      const doc = new PDFDocument();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=submission-${req.params.id}.pdf`);
      
      doc.pipe(res);
      
      doc.fontSize(24).text(submission.title, { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text('Author: ScholarForge System', { align: 'center' });
      doc.moveDown(2);
      
      if (content) {
        doc.fontSize(11).text(content, { align: 'justify', lineGap: 5 });
      } else {
        doc.fontSize(11).text('No content provided for typesetting.', { italic: true });
      }
      
      doc.end();
    } catch (error) {
      console.error('Typesetting failed:', error);
      res.status(500).json({ error: 'Typesetting failed' });
    }
  });

  app.get('/api/submissions/:id/versions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const submissionVersions = await db.select()
        .from(versions)
        .where(eq(versions.submissionId, req.params.id))
        .orderBy(desc(versions.createdAt));
      res.json(submissionVersions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch versions' });
    }
  });

  app.post('/api/submissions/:id/versions', requireAuth, async (req: AuthRequest, res) => {
    const { name, content } = req.body;
    try {
      const [newVersion] = await db.insert(versions)
        .values({
          submissionId: req.params.id,
          name,
          content,
        })
        .returning();
      res.json(newVersion);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create version' });
    }
  });

  app.post('/api/submissions/:id/restore', requireAuth, async (req: AuthRequest, res) => {
    const { content } = req.body;
    try {
      await db.update(submissions)
        .set({ content, updatedAt: new Date() })
        .where(eq(submissions.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to restore version' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
