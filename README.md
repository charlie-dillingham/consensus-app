# consensus-app
Personal tool to summarize Reddit community consensus using an LLM
# Recipe Consensus App

A personal, read-only tool that retrieves public posts from a small number 
of user-selected subreddits and uses an LLM (Claude) to summarize recurring 
themes and community consensus on a given topic.

## Example
"Based on recent posts in r/[subreddit], what's the community consensus on 
the best fried chicken recipe?" → the app retrieves recent hot/top posts, 
passes them to Claude for summarization, and returns a synthesized answer 
with links back to the original source posts.

## How it works
1. Fetch recent posts from selected subreddits (read-only, via Reddit's Data API)
2. Pass post content to Claude API for summarization
3. Display synthesized answer with source links

## Scope
- Read-only — no posting, commenting, or voting
- Single-user, personal, non-commercial
- No data redistribution or storage beyond what's needed per query
- Low query volume, triggered manually (not scheduled/continuous polling)

## Status
In development.
