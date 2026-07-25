import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { legalTokens, siteConfig } from '@/site.config';

/**
 * Reads a vendored legal markdown file (content/legal/*.md — kept in sync with
 * the repo's /legal via `npm run sync-legal`), strips the top DRAFT admonition
 * and H1 (the page renders its own title), substitutes [[PLACEHOLDER]] tokens
 * from site.config, and renders it.
 */
async function loadLegal(file: string): Promise<string> {
  const raw = await readFile(join(process.cwd(), 'content', 'legal', file), 'utf8');

  // Drop everything up to and including the first "**Last updated:**" line —
  // that removes the H1 and the DRAFT blockquote. We render our own header.
  const lastUpdatedIdx = raw.indexOf('**Last updated:**');
  let body = lastUpdatedIdx >= 0 ? raw.slice(lastUpdatedIdx) : raw;

  // Remove the "Last updated" line itself (shown via the page header instead).
  body = body.replace(/^\*\*Last updated:\*\*.*$/m, '').trimStart();

  // Substitute [[TOKEN]] placeholders.
  body = body.replace(/\[\[([A-Z_]+)\]\]/g, (match, key: string) =>
    key in legalTokens ? legalTokens[key] : match,
  );

  return body;
}

export async function LegalDoc({
  file,
  title,
  hideDraftBanner = false,
}: {
  file: string;
  title: string;
  /** Suppress the "draft — pending legal review" banner for this page only. */
  hideDraftBanner?: boolean;
}) {
  const body = await loadLegal(file);
  const showDraftBanner = !siteConfig.legal.reviewed && !hideDraftBanner;

  return (
    <article className="legal container">
      <h1>{title}</h1>
      <p className="legal-meta">Last updated: {siteConfig.legal.effectiveDate}</p>

      {showDraftBanner && (
        <div className="draft-banner">
          <strong>Draft — pending legal review.</strong> This document is a working
          draft and not yet legal advice. It will be finalized before public launch.
        </div>
      )}

      <div className="legal-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
    </article>
  );
}
