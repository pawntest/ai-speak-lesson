# Start

Build the MVP under the operating contract in `CLAUDE.md`.

Do not read all project documents into the lead context.

First, run these two subagents in parallel:

1. `PRODUCT-CONTRACT`
   - read `PRODUCT_CONTRACT.md` and `SCENARIOS.json`;
   - write `docs/working/product-summary.md`;
   - return <= 700 words.

2. `REPOSITORY-EXPLORER`
   - inspect the repository only;
   - return <= 500 words.

Then Fable must:

1. approve a minimal architecture and exact file ownership;
2. assign foundation/integration work;
3. use at most two parallel implementers on independent files;
4. integrate;
5. dispatch fresh-context QA;
6. delegate fixes and re-run QA;
7. accept only with command and browser evidence.

Fable is not the main coder.
Stop only for credentials, destructive actions, or a genuine scope decision that cannot be inferred.
