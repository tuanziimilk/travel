---
name: blue-light-card-discount-faq-answer
description: Use when rewriting Blue Light Card discount FAQ answers for HotDeals or similar SEO pages from collected search snippets or structured fields. Produces concise, atomic-fact answers that are readable, AI-search friendly, and consistent across merchants.
---

# Blue Light Card Discount FAQ Answer

Use this skill when the user provides merchant-level query/result data and wants a final FAQ answer such as:

`Does [Brand] offer a Blue Light Card discount?`

## Goal

Turn noisy snippets or structured discount data into one final answer that is:

- direct and factual
- easy to read
- SEO-friendly and AI-search friendly
- aligned with Atomic Facts
- consistent across merchants at scale
- usually under 50 words

## Input Pattern

Expected inputs may include:

- a question, usually `Does [Brand] offer a Blue Light Card discount?`
- one or more snippets, summaries, or AI Overview results
- optional structured fields such as:
  - `term_id`
  - `country`
  - `domain`
  - `term_name`
  - `fact_type`
  - `supported`
  - `status`
  - `discount_type`
  - `discount_value`
  - `currency`
  - `discount_details`
  - `url`

## Source-of-Truth Priority

When facts conflict, use this priority order:

1. Structured fields such as `supported`, `discount_type`, and `discount_value`
2. Official merchant wording that explicitly mentions Blue Light Card
3. Official merchant wording that explicitly states the offer is available through Blue Light Card
4. Official merchant wording that explicitly mentions NHS staff, healthcare workers, or key workers
5. Reliable third-party snippets with explicit Blue Light Card, NHS, healthcare, or key-worker support
6. Indirect, inferred, historical, or mixed evidence

Do not override clear structured fields with weaker snippet language.

## Output Modes

### 1. Answer mode

Write the final answer only unless the user explicitly asks for analysis or structured rows.

Do not add:

- analysis
- citations
- source names
- explanations of reasoning
- labels like `Answer:`

### 2. Upload-sheet mode

When the user requests upload-ready output, return structured values using the required field order. Prefer the `.xlsx` template in `assets`.

### 3. FAQ-row mode

When the user requests content-output rows, return structured row values using the required field order. Prefer the `.xlsx` template in `assets`.

## Core Decision Logic

### Use `Yes,` when:
- the evidence clearly supports a Blue Light Card discount, or
- the evidence clearly says eligible Blue Light Card members can unlock a merchant offer, or
- the evidence clearly supports a discount for NHS staff, healthcare workers, or key workers

### Use `No,` only when:
- current, explicit evidence clearly states that the merchant does not offer a Blue Light Card discount or any related NHS, healthcare, or key-worker discount

### Use a cautious form when:
- the evidence is indirect
- the evidence is mixed or incomplete
- the offer is for teachers, students, military, veterans, or first responders only
- the offer is for a generic discount platform only
- the offer is historical only
- Blue Light Card, NHS, healthcare, or key-worker eligibility is possible but not confirmed

Absence of evidence is not enough for `No,`

## Blue Light Card Boundary Rules

Treat these carefully:

- **Explicit Blue Light Card mention** -> `Yes,`
- **Offer explicitly available through Blue Light Card** -> `Yes,`
- **Explicit NHS discount** -> `Yes,`
- **Explicit healthcare-worker discount** -> `Yes,`
- **Explicit key-worker discount** -> `Yes,`
- Keep positive answers in the form `Yes, [Brand] ...`
- **Teachers, students, military, veterans, or first responders only** -> cautious form
- **Past or expired Blue Light Card language only** -> cautious form

Do not downgrade a clearly supported NHS, healthcare, or key-worker discount to cautious just because Blue Light Card is not named explicitly. When Blue Light Card is not explicitly supported, explain that clearly in the second sentence.

## Writing Rules

Always:

- answer the question in the first sentence
- include the merchant name
- include the phrase `Blue Light Card discount` when natural
- use simple present tense
- prefer 2 short sentences when a supporting fact improves clarity
- use 1 sentence only when no reliable supporting detail adds value
- keep the answer compact and usually under 50 words

Keep only the most useful facts:

1. whether the merchant offers a Blue Light Card discount or a closely related NHS, healthcare, or key-worker discount
2. discount amount, if clearly supported
3. eligible group, if clearly supported
4. verification method or access path, if clearly supported
5. one key restriction, if central to eligibility

Remove:

- citations
- source names
- dates unless essential
- extra background
- marketing wording
- recommendations like "check the website"
- repeated details
- unsupported claims
- unrelated savings information

## Detail Preference Rule

When the evidence clearly includes supported details, prefer using them instead of generic supporting language.

Prioritize these details in this order:

1. discount value
2. eligible group
3. verification method or access path
4. where the discount applies
5. one central restriction

Examples:
- `10% off for NHS staff`
- `15% off for healthcare workers`
- `up to 20% off for key workers`
- `available through Blue Light Card`
- `verified through a discount portal`
- `applies to full-priced items only`

Do not add or infer details that are not clearly supported.

## Discount Value Rules

Use discount values conservatively.

- If a specific value is clearly supported, include it in the first sentence.
- If the wording is `up to X%`, keep `up to X%`. Do not simplify it to `X%`.
- If multiple values apply to different categories, use the broadest clearly supported value only if it is the main offer.
- If the value is inconsistent or unclear, omit it.
- If the Blue Light Card discount is unclear but a related NHS, healthcare, or key-worker offer has a clearly supported value, that value may be used in the second sentence to clarify what the available offer actually is.
- Mention minimum order, exclusions, or one-time-use limits only if central to eligibility.
- Do not over-compress thresholds or exclusions into the first sentence unless they define the offer.

## Brand Name Rules

Use the merchant name from the query as the display brand.

Do not replace it with:

- a parent brand
- a sister site
- a broader retailer name

unless the query and evidence clearly refer to the same merchant and the relationship is explicit.

Keep brand names unchanged in the final answer.

## Standard Answer Patterns

Do not limit the answer to a single sentence.

Use 2 short sentences by default when helpful:

- Sentence 1: direct answer to the question
- Sentence 2: the most useful supporting fact, such as discount value, eligible group, verification method, access path, product scope, or a key restriction

Use the shortest accurate pattern.

Vary sentence structure across merchants when the facts differ. Avoid repeating the exact same second sentence pattern unless the evidence is materially the same.

### Positive: explicit Blue Light Card discount
`Yes, [Brand] offers a [X%] Blue Light Card discount for eligible members. It is usually available through Blue Light Card verification.`

### Positive: NHS, healthcare, or key-worker wording
`Yes, [Brand] offers a discount for eligible NHS staff, healthcare workers, or key workers. Blue Light Card support is not always stated explicitly.`

### Positive: Blue Light Card discount with offer scope
`Yes, [Brand] offers a [X%] Blue Light Card discount for eligible members. It typically applies to [main product scope or purchase type].`

### Positive: related-group discount with detail
`Yes, [Brand] offers a [X%] discount for eligible NHS staff, healthcare workers, or key workers. Verification is usually required through [platform or portal].`

### Positive: cautious value wording
`Yes, [Brand] offers up to [X%] off for eligible Blue Light Card members, NHS staff, healthcare workers, or key workers. Verification is usually required through [platform].`

### Negative: explicit no
`No, [Brand] does not offer a Blue Light Card discount. No dedicated Blue Light Card, NHS, healthcare, or key-worker offer is currently advertised.`

### Unclear: no explicit Blue Light Card or related discount
`[Brand] does not clearly advertise a dedicated Blue Light Card discount. Blue Light Card, NHS, healthcare, or key-worker eligibility is not clearly confirmed.`

### Unclear: related non-Blue-Light-Card offer only
`A Blue Light Card discount is not clearly confirmed for [Brand]. It mainly promotes [X%] off for [teachers, students, military personnel, veterans, first responders, or another supported group] instead.`

### Unclear: historical or indirect support only
`[Brand] does not appear to offer a dedicated Blue Light Card discount. The available information points to past or indirect offers instead.`

### Unclear: alternate cautious opening
`A standard Blue Light Card discount is not clearly available at [Brand]. The clearly supported offer appears to target a different group instead.`

Do not add generic advice, source references, or promotional wording.

## Second-Sentence Rules

Use the second sentence to add only one type of supporting detail.

Choose this priority order:

1. a clearly supported numeric detail
2. who qualifies
3. verification method or access path
4. where the discount applies
5. one central restriction
6. related non-Blue-Light-Card offer category

### Good second-sentence content

Use:
- `Verification is usually required through Blue Light Card.`
- `It is usually available through a verified Blue Light Card offer page.`
- `It typically applies to full-priced items.`
- `A minimum order may apply.`
- `Membership verification is usually required before the code is revealed.`
- `The offer covers NHS staff, healthcare workers, or key workers.`
- `The available offer appears to be 10% off for students instead.`
- `Eligible shoppers usually verify through a partner platform.`
- `The offer is generally available through a verified discount portal.`
- `A 15% military discount is mentioned, but Blue Light Card, NHS, or key-worker eligibility is not clearly confirmed.`

### Do not use the second sentence for:
- recommendations to visit the website
- source names
- dates unless essential
- multiple restrictions in one sentence
- extra savings unrelated to the main answer
- unsupported expansion beyond clearly supported groups

## Opening Pattern Rules

Use one of these opening forms only:

- `Yes, [Brand] ...`
- `No, [Brand] ...`
- `[Brand] does not clearly advertise a dedicated Blue Light Card discount.`
- `A Blue Light Card discount is not clearly confirmed for [Brand].`
- `[Brand] does not appear to offer a dedicated Blue Light Card discount.`
- `A standard Blue Light Card discount is not clearly available at [Brand].`

Do not start with:

- `Maybe`
- `It may or may not`

If the second sentence does not improve clarity, omit it.

The `Yes,` and `No,` opening pattern is safe in `.xlsx` outputs because the full answer remains in one cell. Avoid plain `.csv` unless fields are correctly quoted.

## Unclear Answer Rule

When the answer is unclear, the second sentence should explain the nearest supported offer category. If a supported numeric value exists, prefer using it.

Examples:
- `[Brand] does not clearly advertise a dedicated Blue Light Card discount. It promotes 10% off for students instead.`
- `A Blue Light Card discount is not clearly confirmed for [Brand]. The available offer is for military personnel rather than NHS staff, healthcare workers, or key workers.`
- `[Brand] does not appear to offer a dedicated Blue Light Card discount. A 15% first responder offer is mentioned, but Blue Light Card, NHS, healthcare, or key-worker eligibility is not clearly confirmed.`
- `A standard Blue Light Card discount is not clearly available at [Brand]. The evidence points to a related non-Blue-Light-Card offer rather than a clearly confirmed member benefit.`

## Atomic Facts Rules

Each sentence should make one clear claim.

Do not:

- combine multiple uncertain claims in one sentence
- infer unsupported eligibility from weak evidence
- overstate unrelated group discounts as Blue Light Card discounts
- mix current and historical claims in the same sentence

If evidence is mixed, prefer the cautious form.

## Market and Language Rules

Match the output language to the user's requested language or target market.

- For UK English pages, keep `Blue Light Card discount`
- For non-English output, preserve the merchant name and discount meaning
- Do not mix languages unless explicitly requested

If market is unclear, follow the user's language.

## Upload Sheet Mode

When the user requests upload-ready output, use this field order:

`term_id,country,domain,term_name,fact_type,supported,status,discount_type,discount_value,currency,discount_details,url`

### Field Rules

- `country`: if the source value is `MAIN`, output `us`; otherwise keep the original value
- `term_name`: use the merchant name only
- `fact_type`: keep the exact provided value
- `supported`: keep the exact normalized value such as `yes`, `no`, or `unknown`
- `status`: keep the provided value
- `discount_type`: keep the exact structured type
- `discount_value`: keep the core numeric or textual value only
- `currency`: fill only when required
- `discount_details`: write one short factual answer based on the structured facts
- `url`: keep the provided value if present; do not depend on it for the answer

### `discount_details` patterns

- positive with percent
  `Yes, [Brand] offers a [X%] Blue Light Card discount for eligible members, NHS staff, healthcare workers, or key workers. Verification is usually required through [platform if clearly supported].`

- positive with amount
  `Yes, [Brand] offers a [currency][X] Blue Light Card or related healthcare/key-worker discount. Eligibility or verification may apply.`

- positive with threshold
  `Yes, [Brand] offers a Blue Light Card or related NHS, healthcare, or key-worker discount on qualifying orders over [currency][X]. Eligibility or product restrictions may apply.`

- negative
  `No, [Brand] does not offer a Blue Light Card discount. No dedicated Blue Light Card, NHS, healthcare, or key-worker offer is currently advertised.`

- unclear with numeric detail
  `[Brand] does not clearly advertise a dedicated Blue Light Card discount. The available offer appears to be [X%] off for [teachers, students, military personnel, veterans, first responders, or another supported group] instead.`

- unclear generic
  `A Blue Light Card discount is not clearly confirmed for [Brand]. It may offer related discounts for other groups instead.`

Keep `discount_details` concise and directly tied to the structured facts.

## FAQ Content Row Mode

When the user requests content-output rows, use this field order:

`ContentType,Country,TermID,TermName,Domain,Source,Subclass,板块名称,Titile1,Brief Introduction,Href Kw,Href Url`

### Field Rules

- `ContentType`: default to `faq`
- `Country`: if the source value is `MAIN`, output `us`; otherwise keep the original value
- `TermID`: use the input `term_id`
- `TermName`: use the merchant name only
- `Domain`: use the provided domain
- `Source`: default to `AI` unless the user provides another value
- `Subclass`: use the current subclass route, which for this skill is `blue light card`
- `板块名称`: default to `faq`
- `Titile1`: `Does [Brand] offer a Blue Light Card discount?`
- `Brief Introduction`: use 1-2 short sentences based on the supported facts
- `Href Kw` and `Href Url`: leave blank unless explicitly provided

### `Brief Introduction` patterns

- positive
  `Yes, [Brand] offers a [X%] Blue Light Card discount for eligible members, NHS staff, healthcare workers, or key workers. It is usually available through [platform if supported].`

- negative
  `No, [Brand] does not offer a Blue Light Card discount. No dedicated Blue Light Card, NHS, healthcare, or key-worker offer is currently advertised.`

- unclear with numeric detail
  `[Brand] does not clearly advertise a dedicated Blue Light Card discount. The available offer appears to be [X%] off for [teachers, students, military personnel, veterans, first responders, or another supported group] instead.`

- unclear generic
  `A Blue Light Card discount is not clearly confirmed for [Brand]. It may promote discounts for related groups instead.`

## Good Examples

`Yes, Dell offers a 10% Blue Light Card or related healthcare discount for eligible NHS staff and healthcare workers. Verification is usually required through a discount portal.`

`Yes, Nike offers a 10% discount for eligible NHS staff, healthcare workers, or key workers. Blue Light Card support is not always stated explicitly.`

`4 Wheel Parts does not clearly advertise a dedicated Blue Light Card discount. It mainly promotes discounts for military personnel and veterans instead.`

`A Blue Light Card discount is not clearly confirmed for Frames Direct. The available offer appears to target a different group rather than Blue Light Card members, NHS staff, or key workers.`

## Bad Examples

- `Yes, according to multiple sources, the brand currently appears to offer a special deal.`
- `The brand proudly supports heroes with an amazing Blue Light Card offer.`
- `Yes. NHS staff, teachers, students, and many others can all save in different ways.`
- `Yes. Visit the official website to check the latest terms.`
- `It may or may not offer a Blue Light Card discount depending on your region and eligibility.`
- `Yes. The discount may be 10%, 15%, or 20% depending on the item.`
