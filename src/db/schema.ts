import { pgTable, text, timestamp, uuid, pgEnum, jsonb } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['admin', 'editor', 'reviewer', 'author']);
export const submissionStatusEnum = pgEnum('submission_status', [
  'draft',
  'submitted',
  'in_review',
  'revision_required',
  'accepted',
  'rejected',
  'published'
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  uid: text('uid').notNull().unique(), // Firebase UID
  email: text('email').notNull().unique(),
  name: text('name'),
  role: userRoleEnum('role').default('author').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const journals = pgTable('journals', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  journalId: uuid('journal_id').references(() => journals.id).notNull(),
  authorId: uuid('author_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  abstract: text('abstract'),
  content: jsonb('content'), // Tiptap JSON content
  status: submissionStatusEnum('status').default('draft').notNull(),
  metadata: jsonb('metadata'), // DOI, Crossref data, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  submissionId: uuid('submission_id').references(() => submissions.id).notNull(),
  reviewerId: uuid('reviewer_id').references(() => users.id).notNull(),
  comments: text('comments'),
  decision: text('decision'), // minor_revision, major_revision, accept, reject
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const inlineComments = pgTable('inline_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  submissionId: uuid('submission_id').references(() => submissions.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  content: text('content').notNull(),
  range: jsonb('range'), // Selection range for Tiptap
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const versions = pgTable('versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  submissionId: uuid('submission_id').references(() => submissions.id).notNull(),
  name: text('name').notNull(),
  content: jsonb('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
