import {
  AUTHORS_PATH,
  WRITING_INDEX_PATH,
  appendWritingIndexLink,
  knownAuthorIds,
  parseAuthorsYaml,
  renderAuthorsYaml,
  resolveAuthorIds,
} from "./authors.js";
import { BlogError } from "./errors.js";
import {
  GitHubClient,
  idempotencyHash,
  postPath,
  pullRequestBody,
  shortIdempotency,
  uniqueBranch,
} from "./github.js";
import {
  parseFrontmatter,
  parsePostId,
  renderPost,
  validatePostFields,
  validationReport,
} from "./validate.js";
import type { AuthorInfo, PostFields, Principal } from "./types.js";

export interface CreateInput {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  description: string;
  authors: string[];
  categories: string[];
  tags: string[];
  comments?: boolean;
  date?: string;
  link_on_writing_index?: boolean;
  idempotency_key?: string;
  dry_run?: boolean;
}

export interface UpdateInput {
  slug: string;
  title?: string;
  excerpt?: string;
  body?: string;
  description?: string;
  authors?: string[];
  categories?: string[];
  tags?: string[];
  comments?: boolean;
  date?: string;
  draft?: boolean;
  link_on_writing_index?: boolean;
  idempotency_key?: string;
  dry_run?: boolean;
}

export async function listAuthors(github: GitHubClient) {
  const file = await github.getFile(AUTHORS_PATH);
  return parseAuthorsYaml(file.content);
}

export async function getPublishedPost(github: GitHubClient, id: string) {
  const slug = parsePostId(id);
  const file = await github.getFile(postPath(slug));
  const parsed = parseFrontmatter(file.content);
  if (parsed.frontmatter.draft) {
    throw new BlogError("not_found", `Post '${slug}' is a draft and is not public`);
  }
  return {
    slug: parsed.frontmatter.slug,
    path: file.path,
    title: parsed.title,
    excerpt: parsed.excerpt,
    body: parsed.body,
    markdown: file.content,
    frontmatter: parsed.frontmatter,
  };
}

export async function validateCreate(
  github: GitHubClient,
  input: CreateInput,
  allowPublish: boolean,
) {
  const authorsFile = await github.getFile(AUTHORS_PATH);
  const resolved = await resolveAuthorIds(
    input.authors,
    parseAuthorsYaml(authorsFile.content),
    (login) => github.getUser(login),
  );
  const fields = validatePostFields(
    { ...input, authors: resolved.ids, comments: input.comments ?? false, draft: true },
    knownAuthorIds(resolved.catalog),
    { forceDraft: true, allowPublish },
  );
  if (await github.fileExists(postPath(fields.slug))) {
    throw new BlogError("slug_taken", `A post with slug '${fields.slug}' already exists on main`);
  }
  return { fields, authorsFile, authorsAdded: resolved.added, authorsCatalog: resolved.catalog };
}

export async function validateUpdate(
  github: GitHubClient,
  input: UpdateInput,
  allowPublish: boolean,
) {
  const existing = await github.getFile(postPath(input.slug));
  const parsed = parseFrontmatter(existing.content);
  const authorsFile = await github.getFile(AUTHORS_PATH);
  const requested = input.authors ?? parsed.frontmatter.authors;
  const resolved = await resolveAuthorIds(
    requested,
    parseAuthorsYaml(authorsFile.content),
    (login) => github.getUser(login),
  );
  const merged: PostFields = {
    ...parsed.frontmatter,
    title: input.title ?? parsed.title,
    excerpt: input.excerpt ?? parsed.excerpt,
    body: input.body ?? parsed.body,
    authors: resolved.ids,
    categories: input.categories ?? parsed.frontmatter.categories,
    tags: input.tags ?? parsed.frontmatter.tags,
    comments: input.comments ?? parsed.frontmatter.comments,
    date: input.date ?? parsed.frontmatter.date,
    description: input.description ?? parsed.frontmatter.description,
    draft: input.draft ?? parsed.frontmatter.draft,
    slug: parsed.frontmatter.slug,
  };
  const fields = validatePostFields(merged, knownAuthorIds(resolved.catalog), {
    forceDraft: false,
    allowPublish,
  });
  return {
    fields,
    existing,
    authorsFile,
    authorsAdded: resolved.added,
    authorsCatalog: resolved.catalog,
  };
}

export async function createPost(
  github: GitHubClient,
  principal: Principal,
  input: CreateInput,
) {
  const allowPublish = principal.scopes.includes("posts:publish");
  if (input.idempotency_key && !input.dry_run) {
    const fullHash = await idempotencyHash(input.idempotency_key);
    const existing = await github.findIdempotentPull(fullHash);
    if (existing) {
      return {
        reused: true,
        pr_url: existing.html_url,
        pr_number: existing.number,
        idempotency_key: input.idempotency_key,
      };
    }
  }

  const { fields, authorsFile, authorsAdded, authorsCatalog } = await validateCreate(
    github,
    input,
    allowPublish,
  );
  if (input.dry_run) {
    return {
      dry_run: true,
      validation: validationReport(fields),
      authors_added: authorsAdded,
    };
  }

  const markdown = renderPost(fields);
  const branch = uniqueBranch(principal.principal, fields.slug);
  const sha = await github.getDefaultSha();
  await github.createBranch(branch, sha);
  await github.putFile(postPath(fields.slug), markdown, branch, `Add draft post: ${fields.slug}`);
  await writeAuthorsFile(github, branch, authorsFile, authorsCatalog, authorsAdded);

  if (input.link_on_writing_index) {
    const index = await github.getFile(WRITING_INDEX_PATH, branch);
    const next = appendWritingIndexLink(index.content, fields.title, fields.slug, fields.description);
    if (next !== index.content) {
      await github.putFile(
        WRITING_INDEX_PATH,
        next,
        branch,
        `Link ${fields.slug} from writing index`,
        index.sha,
      );
    }
  }

  const fullHash = input.idempotency_key ? await idempotencyHash(input.idempotency_key) : undefined;
  const pull = await github.createPullRequest(
    `Add draft: ${fields.title}`,
    branch,
    pullRequestBody({
      principal,
      slug: fields.slug,
      draft: fields.draft,
      action: "create",
      idempotencyHash: fullHash,
    }),
  );
  const labels = ["mcp", "draft-post"];
  if (fullHash) {
    labels.push(`idemp-${shortIdempotency(fullHash)}`);
  }
  await github.addLabels(pull.number, labels);
  return {
    reused: false,
    pr_url: pull.html_url,
    pr_number: pull.number,
    branch,
    validation: validationReport(fields),
    authors_added: authorsAdded,
    agent: `agent:${principal.principal}:${principal.agentName}`,
  };
}

export async function updatePost(
  github: GitHubClient,
  principal: Principal,
  input: UpdateInput,
) {
  const allowPublish = principal.scopes.includes("posts:publish");
  if (input.idempotency_key && !input.dry_run) {
    const fullHash = await idempotencyHash(input.idempotency_key);
    const existing = await github.findIdempotentPull(fullHash);
    if (existing) {
      return {
        reused: true,
        pr_url: existing.html_url,
        pr_number: existing.number,
        idempotency_key: input.idempotency_key,
      };
    }
  }

  const { fields, existing, authorsFile, authorsAdded, authorsCatalog } = await validateUpdate(
    github,
    input,
    allowPublish,
  );
  if (input.dry_run) {
    return {
      dry_run: true,
      validation: validationReport(fields),
      authors_added: authorsAdded,
    };
  }

  const markdown = renderPost(fields);
  const branch = uniqueBranch(principal.principal, fields.slug);
  const sha = await github.getDefaultSha();
  await github.createBranch(branch, sha);
  await github.putFile(
    postPath(fields.slug),
    markdown,
    branch,
    `Update post: ${fields.slug}`,
    existing.sha,
  );
  await writeAuthorsFile(github, branch, authorsFile, authorsCatalog, authorsAdded);

  if (input.link_on_writing_index) {
    const index = await github.getFile(WRITING_INDEX_PATH, branch);
    const next = appendWritingIndexLink(index.content, fields.title, fields.slug, fields.description);
    if (next !== index.content) {
      await github.putFile(
        WRITING_INDEX_PATH,
        next,
        branch,
        `Link ${fields.slug} from writing index`,
        index.sha,
      );
    }
  }

  const fullHash = input.idempotency_key ? await idempotencyHash(input.idempotency_key) : undefined;
  const pull = await github.createPullRequest(
    `Update: ${fields.title}`,
    branch,
    pullRequestBody({
      principal,
      slug: fields.slug,
      draft: fields.draft,
      action: "update",
      idempotencyHash: fullHash,
    }),
  );
  const labels = ["mcp", "draft-post"];
  if (fullHash) {
    labels.push(`idemp-${shortIdempotency(fullHash)}`);
  }
  await github.addLabels(pull.number, labels);
  return {
    reused: false,
    pr_url: pull.html_url,
    pr_number: pull.number,
    branch,
    validation: validationReport(fields),
    authors_added: authorsAdded,
    agent: `agent:${principal.principal}:${principal.agentName}`,
  };
}

async function writeAuthorsFile(
  github: GitHubClient,
  branch: string,
  authorsFile: { content: string; sha: string },
  catalog: AuthorInfo[],
  added: AuthorInfo[],
) {
  if (!added.length) {
    return;
  }
  const next = renderAuthorsYaml(catalog);
  if (next === authorsFile.content) {
    return;
  }
  await github.putFile(
    AUTHORS_PATH,
    next,
    branch,
    `Add author${added.length === 1 ? "" : "s"} from GitHub: ${added.map((author) => author.id).join(", ")}`,
    authorsFile.sha,
  );
}
