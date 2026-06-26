create extension if not exists "uuid-ossp";

create table if not exists articles (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  source text not null,
  url text not null unique,
  published_at timestamptz,
  summary text,
  full_text text,
  region text,
  topic_tags text[] default '{}',
  created_at timestamptz default now()
);

create table if not exists topics (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  score numeric(3,1) not null default 0,
  region text,
  category text,
  rationale text,
  tags text[] default '{}',
  status text not null default 'new' check (status in ('new', 'selected', 'drafted', 'published')),
  related_articles uuid[] default '{}',
  key_questions text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists drafts (
  id uuid primary key default uuid_generate_v4(),
  topic_id uuid references topics(id) on delete cascade,
  ig_title text not null,
  subheadings text[] default '{}',
  caption text not null,
  sources text[] default '{}',
  hashtags text[] default '{}',
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'published')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists source_feeds (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  url text not null unique,
  source_type text not null default 'news',
  enabled boolean not null default true,
  created_at timestamptz default now()
);

insert into source_feeds (name, url, source_type) values
  ('BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'news'),
  ('DW Top Stories', 'https://rss.dw.com/rdf/rss-en-top', 'news'),
  ('NATO News', 'https://www.nato.int/cps/en/natohq/news.xml', 'official')
on conflict (url) do nothing;
