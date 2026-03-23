---
name: military-discount-faq-answer
description: Use when turning merchant-level military discount evidence into a final FAQ answer, upload-sheet row, or FAQ content row for questions like "Does [Brand] offer a military discount?" Trigger this skill when the user provides snippets, AI overview text, structured discount fields, or mixed evidence and wants a compact SEO-friendly output.
---

# Military Discount FAQ Answer

## Overview

This skill converts merchant military-discount evidence into one of three outputs: a final answer, an upload-sheet row, or a FAQ-row. It is optimized for HotDeals-style SEO content and keeps claims cautious when the evidence is mixed, indirect, historical, or merchant-mismatched.

## Output Modes

Choose the output mode from the user's request:

- `Answer mode`: return only the final FAQ answer
- `Upload-sheet mode`: return `term_id,country,domain,term_name,fact_type,supported,status,discount_type,discount_value,currency,discount_details,url`
- `FAQ-row mode`: return `ContentType,Country,TermID,TermName,Domain,Source,Subclass,板块名称,Titile1,Brief Introduction,Href Kw,Href Url`

Do not add analysis, labels, citations, or reasoning unless the user explicitly asks for them.

## Source Priority

When evidence conflicts, use this order:

- Structured fields such as `supported`, `discount_type`, and `discount_value`
- Official merchant wording with explicit military discount terms
- Reliable third-party snippets with explicit military support
- Indirect, inferred, historical, or mixed evidence

Do not let weak snippets override clear structured fields.

## Decision Rules

Use these openings only:

- `Yes, [Brand] ...`
- `No, [Brand] ...`
- `It does not clearly advertise a dedicated military discount.`
- `It does not clearly advertise a military discount.`

Classify the case like this:

- Use `Yes,` when there is a clear military-specific percentage discount, fixed-amount discount, special pricing, free membership, access benefit, or verified military offer through a partner or dedicated page.
- Use `No,` only when current evidence clearly says there is no military discount or clearly rules out a current military-specific offer.
- Use `It does not clearly advertise a dedicated military discount.` when evidence points to only occasional military promotions, public promo codes, cashback, seasonal sales, indirect support, or historical or incomplete evidence.
- Use `It does not clearly advertise a military discount.` when the evidence refers to a different merchant, related brand, partner site, or category page and does not clearly match the query merchant.

Absence of evidence alone is not enough for `No,`.

## Writing Rules

Always:

- answer in the first sentence
- include the merchant name when using `Yes,` or `No,`
- use simple present tense
- keep wording factual and compact
- stay under 50 words when possible

Prefer one sentence unless a second sentence adds one useful supported detail. If you use a second sentence, keep only the strongest support detail in this order:

- discount amount or benefit type
- verification method such as `ID.me`, `GOVX`, `WeSalute+`, or `SheerID`
- eligible military group
- channel, program, or location
- region
- general-savings fallback
- merchant mismatch clarification

Do not include source names, dates unless essential, marketing language, generic advice, or multiple restrictions in one sentence.

## Structured Output Rules

### Upload-sheet mode

- Keep field order exactly as requested.
- Convert `country=MAIN` to `us`.
- Use the merchant name only for `term_name`.
- Preserve `fact_type`, `supported`, `status`, `discount_type`, `discount_value`, and `url` as provided when available.
- Fill `currency` only when needed.
- Write `discount_details` as one concise factual answer using the decision rules above.

### FAQ-row mode

- Keep field order exactly as requested.
- Set `ContentType` to `faq`.
- Convert `Country=MAIN` to `us`.
- Set `Source` to `AI` unless the user provides another value.
- Set `Subclass` to the current subclass route, which for this skill is `military`.
- Set `板块名称` to `faq`.
- Set `Titile1` to `Does [Brand] offer military discount?`
- Write `Brief Introduction` as a 1-2 sentence answer following the same rules.
- Leave `Href Kw` and `Href Url` blank unless the user provides them.

## Workflow

1. Identify the merchant name and keep it unchanged.
2. Determine the output mode.
3. Read structured fields first if present.
4. Classify the evidence into one of these cases: percentage discount, fixed-amount discount, military-specific benefit, limited channel or location, no dedicated program but general savings, cashback only, merchant mismatch, explicit no, or unclear.
5. Write the shortest accurate answer without overstating a non-dedicated offer as a true military discount.
6. If outputting rows, preserve field order exactly.

## Quality Check

Before returning, confirm:

- the first sentence directly answers the question
- the merchant name is preserved
- discount amount appears only when clearly supported
- general coupons or cashback are not overstated as military discounts
- historical or holiday-only offers are not framed as dedicated current programs
- merchant mismatch is handled cautiously
- the second sentence adds only one support detail
- the output stays compact and SEO-friendly
