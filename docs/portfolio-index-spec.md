# Index and resume changes for portfolio links

The chat API can prefer a portfolio link only when that page is actually in the retrieved context. These changes are in the `tmfarrell.github.io` repo. Do them there, then reindex. This API repo does not own the Pinecone index.

The chat index is built from `content.json`, not from the resume PDF. The resume item indexed today says only "My resume includes more detailed information…". The experience entries are hand-written, and those are the sentences the model quotes. Portfolio items already have an `org` field, but `indexer/chunker.js` never puts it in the embedded `text`, so a question about Day Zero Diagnostics does not match epiXact or MicrohmDB.

## Indexer

In `indexer/chunker.js` `createChunk`, append `[Org: …]` to `searchableContent` when `originalMetadata.org` is set. Category and tags are already appended the same way.

Reindex only after the copy changes below, so one rebuild picks up the org tag and the new sentences.

## Experience copy in `content.json`

These chunks are why an employer question is answered with a job title and the company homepage.

- "Bioinformatics Engineer at Day Zero Diagnostics" is the top Day Zero hit, and its text is only "contributing to data platform and model development…". The resume treats that role and the manager role as one bullet. Replace this stub with the MicrohmDB sentence, or remove the stub so it cannot outrank the real work.
- "Manager, Bioinformatics Engineering at Day Zero Diagnostics" should name MicrohmDB and include `https://tmfarrell.github.io/assets/pdf/microhmdb.pdf` in the content.
- "Product Manager at Day Zero Diagnostics" should name epiXact and include `https://tmfarrell.github.io/assets/pdf/epixact.pdf`. It currently says "outbreak detection sequencing solution" and never the product name.

Same pattern for OM1. Follow-ups miss PhenOM and Insights Platform because those names are not in the experience text.

- "Product Manager at OM1" should name Insights Platform and include `https://tmfarrell.github.io/assets/pdf/insights_platform.pdf`.
- "Senior Product Manager at OM1" should name the PhenOM API and include `https://phenom-docs.om1.com/`.

Keep each document's `url` as the employer site if that is what the list of jobs should show. The portfolio URL has to appear in the chunk text. The model is only allowed to link URLs that appear in the retrieved document.

## Portfolio descriptions in `_data/portfolio.yaml`

The indexed body of a portfolio item is only `description`. Add the employer to the two projects that failed retrieval:

- epiXact: "Outbreak detection service for hospital systems, built at Day Zero Diagnostics."
- MicrohmDB: "Large database for antibiotic susceptibility prediction from genomic data, built at Day Zero Diagnostics."

The `[Org: …]` tag from the indexer covers the other portfolio items. These two descriptions should still say the employer in prose, because that is the sentence the model will quote.

## Resume

`resume/index.html` already links the right PDFs. The visible words do not name the products, so the page and the index can drift.

- Day Zero product-manager bullet: name epiXact in the sentence that already links `epixact.pdf`.
- Day Zero engineering bullet: name MicrohmDB in the sentence that already links `microhmdb.pdf`.
- OM1 bullets: say "Insights Platform" and "PhenOM API" next to the links that already point at those pages.

Rebuild the PDF with `scripts/build_resume_pdf.sh` after the HTML edit. Then rebuild the Jekyll site and rerun the indexer so Pinecone picks up the new chunk text.
