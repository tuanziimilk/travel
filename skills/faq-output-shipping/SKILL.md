name: free-shipping-faq-answer
description: Use when rewriting free shipping FAQ answers for HotDeals or similar SEO pages from merchant query data, snippets, AI overview text, or structured shipping fields. Produces concise final answers, upload-sheet rows, or FAQ content rows for questions like "Does [Brand] offer free shipping?"
# Free Shipping FAQ Answer
Use this skill when the user provides merchant-level shipping evidence and wants a final FAQ answer or output row for:
- `Does [Brand] offer free shipping?`
- upload-ready shipping fields
- FAQ/content rows for SEO pages
## What To Produce
Choose the output mode from the user's request:
- `Answer mode`: return only the final FAQ answer
- `Upload-sheet mode`: return `term_id,country,domain,term_name,fact_type,supported,status,discount_type,discount_value,currency,discount_details,url`
- `FAQ-row mode`: return `ContentType,Country,TermID,TermName,Domain,Source,Subclass,鏉垮潡鍚嶇О,Titile1,Brief Introduction,Href Kw,Href Url`
Do not add analysis, labels, citations, or reasoning unless the user explicitly asks for them.
## Source Priority
When evidence conflicts, use this order:
1. Structured fields such as `supported`, `discount_type`, `discount_value`
2. Official merchant wording with explicit shipping terms
3. Reliable third-party snippets with explicit support
4. Indirect, inferred, historical, or mixed evidence
Do not let weak snippets override clear structured fields.
## Decision Rules
Use `Yes,` when the merchant clearly offers any free shipping, including:
- threshold-based free shipping
- free shipping on select items or qualifying orders
- region-limited or shipping-method-limited free shipping
- membership-based free shipping when the question is only whether any free shipping exists
Use `No,` only when:
- current evidence clearly says the merchant does not offer free shipping, or
- the business does not ship physical goods and shipping does not apply
Use `[Brand] does not offer sitewide free shipping.` when:
- free shipping exists only through a membership or subscription
- free shipping depends on the individual seller or store
- free shipping is limited enough that the main truth is "not sitewide"
Use `[Brand] does not clearly advertise free shipping.` when:
- evidence is mixed, indirect, incomplete, or conflicting
- free shipping might exist, but is not clearly supported
Absence of evidence is not enough for `No,`
## Boundary Rules
- Threshold-based free shipping -> `Yes,`
- Free shipping on select items -> `Yes,`
- Membership-only free shipping -> usually `[Brand] does not offer sitewide free shipping.`
- Merchant-dependent delivery -> `[Brand] does not offer sitewide free shipping.`
- Digital products, bookings, rentals, or services without physical shipping -> `No,`
- Free delivery or digital fulfillment is not automatically free shipping
Do not confuse local delivery, booking confirmation, or downloads with shipping of physical goods.
## Writing Rules
Always:
- answer in the first sentence
- include the merchant name when using `Yes,` or `No,`
- use simple present tense
- keep the wording factual and compact
- stay under 50 words when possible
Prefer 2 short sentences when a second sentence adds one useful support detail. Otherwise use 1 sentence.
Vary the second sentence across merchants when the fact pattern is similar. Do not repeat the exact same support sentence across long batches unless the wording is truly the best fit.
Prefer the most distinctive supported detail in sentence two, such as a named program, shipping method, regional limit, product type, or service format.
Keep only the most useful support detail, in this priority order:
1. minimum order threshold
2. item or order scope
3. membership requirement
4. shipping method
5. regional limit
6. merchant-dependent logic
7. digital/service clarification
When possible, make that support detail merchant-specific:
- named program like `Flat Cap Club`
- shipping method like `ground shipping` or `standard shipping`
- market limit like `the 48 contiguous states`
- product scope like `travel packages`
- service format like `digital downloads` or `booking confirmations`
Do not include:
- source names
- dates unless essential
- marketing language
- generic advice like "check the website"
- multiple restrictions in one sentence
- unsupported assumptions
## Opening Forms
Start with one of these only:
- `Yes, [Brand] ...`
- `No, [Brand] ...`
- `[Brand] does not offer sitewide free shipping.`
- `[Brand] does not clearly advertise free shipping.`
Do not start with `Maybe` or other uncertain hedges.
## Standard Patterns
### Positive: threshold
`Yes, [Brand] offers free shipping on orders over [threshold]. It applies to qualifying orders only.`
`Yes, [Brand] provides free shipping when your order exceeds [threshold]. The offer usually covers eligible purchases.`
### Positive: select items
`Yes, [Brand] offers free shipping on select items or qualifying orders. Scope restrictions may apply.`
### Positive: limited by method or region
`Yes, [Brand] offers free shipping under certain conditions. It usually applies to standard or ground shipping only.`
### Limited: membership
`[Brand] does not offer sitewide free shipping. It only provides free shipping through its membership or subscription program.`
`[Brand] does not offer sitewide free shipping. Free shipping is limited to its membership or subscription program.`
### Limited: merchant dependent
`[Brand] does not offer sitewide free shipping. Free shipping or delivery depends on the individual merchant or store.`
`[Brand] does not offer sitewide free shipping. Shipping terms vary by seller rather than following a platform-wide free shipping policy.`
### Negative: digital or service
`No, [Brand] does not offer free shipping because it does not ship physical products. It provides digital products or services instead.`
`No, [Brand] does not offer free shipping because it does not ship physical items. Customers typically receive digital downloads, bookings, or confirmations instead.`
### Negative: explicit no
`No, [Brand] does not offer free shipping. Paid shipping options apply instead.`
### Unclear
`[Brand] does not clearly advertise free shipping. The available information does not confirm a general free shipping policy.`
## Structured Output Rules
### Upload-sheet mode
Field order:
`term_id,country,domain,term_name,fact_type,supported,status,discount_type,discount_value,currency,discount_details,url`
Rules:
- convert `country=MAIN` to `us`
- use the merchant name only for `term_name`
- keep `fact_type`, `supported`, `status`, `discount_type`, `discount_value`, and `url` as provided when available
- fill `currency` only when needed
- write `discount_details` as one concise factual answer using the decision rules above
### FAQ-row mode
Field order:
`ContentType,Country,TermID,TermName,Domain,Source,Subclass,鏉垮潡鍚嶇О,Titile1,Brief Introduction,Href Kw,Href Url`
Rules:
- `ContentType`: `faq`
- convert `Country=MAIN` to `us`
- `Source`: fixed to `AI`
- `Subclass`: fixed to `shipping`
- `鏉垮潡鍚嶇О`: `faq`
- `Titile1`: `Does [Brand] offer free shipping?`
- `Brief Introduction`: 1-2 short sentences following the same answer rules
- leave `Href Kw` and `Href Url` blank unless provided
## Workflow
1. Identify the merchant name from the user's query and keep it unchanged.
2. Determine the output mode.
3. Read structured fields first if present.
4. Classify the shipping case: threshold, select items, membership, merchant-dependent, digital/service, explicit no, unclear.
5. Write the shortest accurate answer without overstating sitewide free shipping.
6. If outputting rows, preserve the requested field order exactly.
## Quality Check
Before returning the answer, confirm:
- the first sentence directly answers the question
- the merchant name is preserved
- the threshold is included only when clearly supported
- sitewide free shipping is not overstated
- digital fulfillment is not treated as shipping
- the second sentence adds only one support detail
- the output is compact, readable, and SEO-friendly
