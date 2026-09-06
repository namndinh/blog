export type Scope = "posts:create" | "posts:update" | "posts:publish";

export interface TokenRecord {
  id: string;
  hash: string;
  principal: string;
  scopes: Scope[];
  expires_at?: string | null;
}

export interface Principal {
  tokenId: string;
  principal: string;
  scopes: Scope[];
  agentName: string;
}

export interface Env {
  BLOG_REPO: string;
  BLOG_SITE_URL: string;
  BLOG_SEARCH_INDEX_URL: string;
  BLOG_DEFAULT_BRANCH: string;
  GITHUB_TOKEN?: string;
  MCP_TOKENS?: string;
}

export interface PostFrontmatter {
  authors: string[];
  categories: string[];
  comments: boolean;
  date: string;
  description: string;
  draft: boolean;
  slug: string;
  tags: string[];
}

export interface PostFields extends PostFrontmatter {
  title: string;
  excerpt: string;
  body: string;
}

export interface ErrorBody {
  code: string;
  message: string;
  retryable: boolean;
  retry_after: number | null;
}

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

export interface AuthorInfo {
  id: string;
  name: string;
  description?: string;
  url?: string;
}
