---
name: first-responder-discount-faq-answer
description: Use when rewriting first responder discount FAQ answers for HotDeals or similar SEO pages from collected search snippets or structured fields. Produces concise, atomic-fact answers that are readable, AI-search friendly, and consistent across merchants.
---

# First Responder Discount FAQ Answer

Use this skill when the user provides merchant-level query/result data and wants a final FAQ answer such as:

`Does [Brand] offer a first responder discount?`

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

- a question, usually `Does [Brand] offer a first responder discount?`
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
2. Official merchant wording that explicitly mentions first responders
3. Official merchant wording that explicitly mentions emergency-service groups that clearly count as first responders, such as police, firefighters, EMTs, paramedics, or EMS personnel
4. Official merchant wording that explicitly mentions key workers
5. Reliable third-party snippets with explicit first responder, emergency-services, or key-worker support
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
- the evidence clearly supports a first responder discount, or
- the evidence clearly supports a discount for first responders through a merchant page or verification platform, or
- the evidence clearly supports an emergency-services discount that explicitly includes first responders such as police, firefighters, EMTs, paramedics, or EMS personnel, or
- the evidence clearly supports a key-worker discount

### Use `No,` only when:
- current, explicit evidence clearly states that the merchant does not offer a first responder discount

### Use a cautious form when:
- the evidence is indirect
- the evidence is mixed or incomplete
- the offer is for military, veterans, teachers, students, NHS staff, or healthcare workers only
- the offer is for Blue Light Card only, but first responder or key-worker eligibility is not clearly stated
- the offer is for generic heroes, service workers, or community workers only
- the offer is historical only
- first responder or key-worker eligibility is possible but not confirmed

Absence of evidence is not enough for `No,`

## First Responder Boundary Rules

Treat these carefully:

- **Explicit first responder mention** -> `Yes,`
- **Explicit police, firefighter, EMT, paramedic, or EMS discount** -> `Yes,`
- **Emergency-services discount explicitly including first responders** -> `Yes,`
- **Explicit key-worker discount** -> `Yes,`
- Keep positive answers in the form `Yes, [Brand] ...`
- **Military, veterans, teachers, students, NHS staff, or healthcare workers only** -> cautious form
- **Blue Light Card or other member-platform offer only, without explicit first responder or key-worker support** -> cautious form
- **Generic hero or service-worker language without clear first responder or key-worker eligibility** -> cautious form
- **Past or expired first responder language only** -> cautious form

Do not convert a general healthcare, Blue Light Card, or community-worker offer into a first responder discount unless first responder or key-worker eligibility is explicitly confirmed.

## Writing Rules

Always:

- answer the question in the first sentence
- include the merchant name
- include the phrase `first responder discount` when natural
- use simple present tense
- prefer 2 short sentences when a supporting fact improves clarity
- use 1 sentence only when no reliable supporting detail adds value
- keep the answer compact and usually under 50 words

Keep only the most useful facts:

1. whether the merchant offers a first responder discount
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
- recommendations like “check the website”
- repeated details
- unsupported claims
- unrelated savings information

## Detail Preference Rule

When the evidence clearly includes supported details, prefer using them instead of generic supporting language.

If the source details mention a concrete discount type, product scope, order threshold, cash-back amount, ticket condition, membership rule, or other merchant-specific business detail, include that exact detail instead of replacing it with generic wording.

Do not flatten specific evidence into broad summaries like `general offers`, `other savings options`, or `discounts instead` when the source already gives clearer information such as:

- `10% off sitewide`
- `20% off select merchandise`
- `up to 4% cash back`
- `hearing glasses`
- `subscriptions for new customers`
- `tickets purchased online, not at the gate`
- `hotel rates at or below per diem`
- `first autoship orders`

Prioritize these details in this order:

1. discount value
2. eligible group
3. verification method or access path
4. where the discount applies
5. one central restriction

Examples:
- `20% off for first responders`
- `10% off for key workers`
- `available through ID.me`
- `verified through GOVX`
- `applies to full-priced items only`

Do not add or infer details that are not clearly supported.

## Discount Value Rules

Use discount values conservatively.

- If a specific value is clearly supported, include it in the first sentence.
- If the wording is `up to X%`, keep `up to X%`. Do not simplify it to `X%`.
- If multiple values apply to different categories, use the broadest clearly supported value only if it is the main offer.
- If the value is inconsistent or unclear, omit it.
- If the first responder discount is unclear but a related non-first-responder offer has a clearly supported value, that value may be used in the second sentence to clarify what the available offer actually is.
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

When multiple merchants use a similar verification flow, vary equivalent phrasing to avoid repetitive outputs. Keep the fact unchanged, but rotate natural forms such as `Verification is usually required through ID.me.`, `Eligible shoppers usually verify through ID.me.`, `The discount is typically accessed through ID.me verification.`, or `First responders usually verify their eligibility through ID.me.`

### Positive: explicit first responder discount
`Yes, [Brand] offers a [X%] first responder discount for eligible first responders. It is usually available through [verification method or access path].`

### Positive: emergency-services wording
`Yes, [Brand] offers a [X%] discount for eligible first responders, including [police officers, firefighters, EMTs, or paramedics if supported]. Verification is usually required through [platform].`

### Positive: key-worker wording
`Yes, [Brand] offers a [X%] first responder or key-worker discount for eligible shoppers. Verification is usually required through [platform or portal].`

### Positive: offer scope
`Yes, [Brand] offers a [X%] first responder discount for eligible first responders or key workers. It typically applies to [main product scope or purchase type].`

### Positive: important restriction
`Yes, [Brand] offers a [X%] first responder discount for eligible first responders or key workers. [Key restriction], such as [minimum order, member requirement, or exclusions], may apply.`

### Positive: cautious value wording
`Yes, [Brand] offers up to [X%] off for eligible first responders or key workers. Verification is usually required through [platform].`

### Negative: explicit no
`No, [Brand] does not offer a first responder discount. No dedicated first responder or key-worker offer is currently advertised.`

### Unclear: no explicit first responder discount
`[Brand] does not clearly advertise a dedicated first responder discount. First responder or key-worker eligibility is not clearly confirmed.`

### Unclear: related non-first-responder offer only
`A first responder discount is not clearly confirmed for [Brand]. It mainly promotes [X%] off for [military personnel, veterans, NHS staff, healthcare workers, students, or another supported group] instead.`

### Unclear: historical or indirect support only
`[Brand] does not appear to offer a dedicated first responder discount. The available information points to past or indirect offers instead.`

### Unclear: alternate cautious opening
`A standard first responder discount is not clearly available at [Brand]. The clearly supported offer appears to target a different group instead.`

Do not add generic advice, source references, or promotional wording.

## Second-Sentence Rules

Use the second sentence to add only one type of supporting detail.

Choose this priority order:

1. a clearly supported numeric detail
2. who qualifies
3. verification method or access path
4. where the discount applies
5. one central restriction
6. related non-first-responder offer category

### Good second-sentence content

Use:
- `Verification is usually required through ID.me.`
- `Eligible shoppers usually verify through ID.me.`
- `The discount is typically accessed through ID.me verification.`
- `First responders usually verify their eligibility through ID.me.`
- `It is usually available through GOVX or a verified partner portal.`
- `Eligible shoppers usually access the offer through GOVX.`
- `The discount is typically claimed through GOVX.`
- `It typically applies to full-priced items.`
- `A minimum order may apply.`
- `The offer covers police officers, firefighters, EMTs, paramedics, and key workers.`
- `The available offer appears to be 10% off for military personnel instead.`
- `It mainly applies to NHS staff or healthcare workers.`
- `Eligible shoppers usually verify through a partner platform.`
- `The offer is generally available through a verified discount portal.`
- `A 15% healthcare discount is mentioned, but first responder or key-worker eligibility is not clearly confirmed.`

### Do not use the second sentence for:
- recommendations to visit the website
- source names
- dates unless essential
- multiple restrictions in one sentence
- extra savings unrelated to the main answer
- unsupported expansion from Blue Light Card, healthcare, or military language to first responder eligibility

## Opening Pattern Rules

Use one of these opening forms only:

- `Yes, [Brand] ...`
- `No, [Brand] ...`
- `[Brand] does not clearly advertise a dedicated first responder discount.`
- `A first responder discount is not clearly confirmed for [Brand].`
- `[Brand] does not appear to offer a dedicated first responder discount.`
- `A standard first responder discount is not clearly available at [Brand].`
- `[Brand] does not currently list a dedicated first responder discount.`
- `[Brand] has no clearly advertised first responder discount.`
- `A dedicated first responder discount is not clearly listed for [Brand].`

Rotate these cautious openings across merchants when the evidence supports the same uncertainty level. Do not default to one negative opener for every unclear case.

Also vary the full unclear answer, not just the opening clause. Rotate equivalent second-sentence structures such as `It mainly offers...`, `The clearest available offer is...`, `The available details point to...`, `The evidence centers on...`, or `The better-supported savings are...` so the entire paragraph does not read like a repeated template.

Do not start with:

- `Maybe`
- `It may or may not`

If the second sentence does not improve clarity, omit it.

The `Yes,` and `No,` opening pattern is safe in `.xlsx` outputs because the full answer remains in one cell. Avoid plain `.csv` unless fields are correctly quoted.

## Unclear Answer Rule

When the answer is unclear, the second sentence should explain the nearest supported offer category. If a supported numeric value exists, prefer using it.

Examples:
- `[Brand] does not clearly advertise a dedicated first responder discount. It promotes 10% off for military personnel and veterans instead.`
- `A first responder discount is not clearly confirmed for [Brand]. The available offer is for healthcare workers, but first responder or key-worker eligibility is not explicitly named.`
- `[Brand] does not appear to offer a dedicated first responder discount. A 15% healthcare offer is mentioned, but first responder eligibility is not clearly confirmed.`
- `A standard first responder discount is not clearly available at [Brand]. The evidence points to a related key-worker or emergency-services offer rather than a clearly confirmed first responder benefit.`

## Atomic Facts Rules

Each sentence should make one clear claim.

Do not:

- combine multiple uncertain claims in one sentence
- infer first responder eligibility from weak evidence
- overstate healthcare, Blue Light Card, or military offers as first responder offers when eligibility is not explicit
- mix current and historical claims in the same sentence

If evidence is mixed, prefer the cautious form.

## Market and Language Rules

Match the output language to the user's requested language or target market.

- For English pages, keep `first responder discount`
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
  `Yes, [Brand] offers a [X%] first responder discount for eligible first responders or key workers. Verification is usually required through [platform if clearly supported].`

- positive with amount
  `Yes, [Brand] offers a [currency][X] first responder discount for eligible first responders or key workers. Eligibility or verification may apply.`

- positive with threshold
  `Yes, [Brand] offers a first responder discount on qualifying orders over [currency][X] for eligible first responders or key workers. Eligibility or product restrictions may apply.`

- negative
  `No, [Brand] does not offer a first responder discount. No dedicated first responder or key-worker offer is currently advertised.`

- unclear with numeric detail
  `[Brand] does not clearly advertise a dedicated first responder discount. The available offer appears to be [X%] off for [military personnel, veterans, healthcare workers, students, or another supported group] instead.`

- unclear generic
  `A first responder discount is not clearly confirmed for [Brand]. It may offer related discounts for other groups instead.`

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
- `Subclass`: use the current subclass route, which for this skill is `first responder`
- `板块名称`: default to `faq`
- `Titile1`: `Does [Brand] offer a first responder discount?`
- `Brief Introduction`: use 1-2 short sentences based on the supported facts
- `Href Kw` and `Href Url`: leave blank unless explicitly provided

### `Brief Introduction` patterns

- positive
  `Yes, [Brand] offers a [X%] first responder discount for eligible first responders or key workers. It is usually available through [platform if supported].`

- negative
  `No, [Brand] does not offer a first responder discount. No dedicated first responder or key-worker offer is currently advertised.`

- unclear with numeric detail
  `[Brand] does not clearly advertise a dedicated first responder discount. The available offer appears to be [X%] off for [military personnel, veterans, healthcare workers, students, or another supported group] instead.`

- unclear generic
  `A first responder discount is not clearly confirmed for [Brand]. It may promote discounts for related groups instead.`

## Good Examples

`Yes, YETI offers a 20% first responder discount for eligible first responders. Eligible shoppers usually verify through ID.me.`

`Yes, Oakley offers a first responder discount for eligible police officers, firefighters, EMTs, paramedics, and key workers. It is usually available through the Oakley Standard Issue program.`

`4 Wheel Parts does not clearly advertise a dedicated first responder discount. It mainly promotes discounts for military personnel and veterans instead.`

`A first responder discount is not clearly confirmed for Frames Direct. The available offer appears to be a healthcare discount rather than a clearly named first responder or key-worker benefit.`

## Bad Examples

- `Yes, according to multiple sources, the brand currently appears to offer a special deal.`
- `The brand proudly supports heroes with an amazing first responder offer.`
- `Yes. First responders, teachers, students, and many others can all save in different ways.`
- `Yes. Visit the official website to check the latest terms.`
- `It may or may not offer a first responder discount depending on your region and eligibility.`
- `Yes. The discount may be 10%, 15%, or 20% depending on the item.`

## Final Checklist

Before answering, confirm that:

- the first sentence directly answers the question
- the merchant name is included
- key-worker discounts can be treated as positive support
- the discount value appears only when clearly supported
- `No,` is used only for explicit negative evidence
- unclear or indirect evidence uses a cautious form with the merchant name in the first sentence
- the answer includes specific details such as discount group, value, or application condition when clearly supported
- the second sentence adds only one useful supporting detail
- the wording is compact, factual, readable, and SEO-friendly
- the total answer is usually under 50 words
