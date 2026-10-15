
# GitHub Wiki Publishing and Recovery

## Why the Wiki URL can be empty

The `docs/wiki/` directory is a normal folder in this repository. GitHub's Wiki is a separate Git repository and its pages are not populated from this folder automatically. If the Wiki feature is disabled or no initial page was created, the URL may not show the expected documentation.

## One-time setup

1. Open the repository on GitHub and navigate to **Settings → General → Features**.
2. Ensure **Wikis** is enabled. A repository administrator must change this setting.
3. Open the **Wiki** tab and create/save the first page (for example, `Home`). This initializes the wiki repository.
4. Clone the wiki repository:
   ```bash
   git clone https://github.com/luckyhegde6/stockResearchApp.wiki.git
   cd stockResearchApp.wiki
   ```
5. Copy Markdown pages from `docs/wiki/` into the wiki checkout, rename `README.md` to `Home.md`, and rewrite relative links to repository docs as absolute GitHub URLs. Links that traverse outside the wiki repository will not resolve correctly.
6. Add `_Sidebar.md`, commit and push the pages to the wiki default branch.

See [GitHub's official guide](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages). GitHub documents that the wiki Git repository becomes cloneable after an initial page has been created.

## Keep one canonical source

Canonical docs live under `docs/` and in root documentation. Treat the GitHub Wiki as a published mirror, not an independently edited source. Review links whenever the source docs change.

This PR can update the normal repository docs, but cannot reliably publish pages into an uninitialized Wiki repository through the regular repository contents API. The one-time settings/page action remains required.

## Always-available fallback

The [Product Roadmap](Product-Roadmap.md), [PRD-004](../prd/004-evidence-first-research-platform.md), and [source data research plan](Free-Research-Data-Sources.md) remain accessible as normal repository docs and through the static site.
