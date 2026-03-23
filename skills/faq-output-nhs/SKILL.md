---
name: nhs-discount-faq-answer
description: Use when rewriting NHS discount FAQ answers for HotDeals or similar SEO pages from collected search snippets or structured fields. Produces concise, atomic-fact answers that are readable, AI-search friendly, and consistent across merchants.
---

# NHS Discount FAQ Answer

Use this skill when the user provides merchant-level query/result data and wants a final FAQ answer such as:

`Does [Brand] offer NHS discount?`

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

- a question, usually `Does [Brand] offer NHS discount?`
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
2. Official merchant wording that explicitly mentions NHS staff
3. Official merchant wording that explicitly mentions healthcare workers, medical staff, nurses, doctors, clinicians, hospital staff, or other healthcare-related groups
4. Reliable third-party snippets with explicit NHS or healthcare-worker discount support
5. Indirect, inferred, historical, or mixed evidence

Do not override clear structured fields with weaker snippet language.

Third-party platform evidence needs extra care:

- A merchant page or verified partner page that clearly states the merchant offers a healthcare-worker or NHS discount can support `Yes,`
- A third-party cashback listing, coupon listing, marketplace aggregation page, or ID.me Shop-style portal mention alone does not automatically support `Yes,`
- If the evidence only shows third-party savings for medical professionals, nurses, or first responders without clearly confirming a merchant-run NHS or healthcare-worker discount, use a cautious form

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
- the evidence clearly supports an NHS discount, or
- the evidence clearly supports a discount for healthcare workers, healthcare professionals, medical staff, nurses, doctors, clinicians, hospital staff, or similar healthcare-related groups

### Use `No,` only when:
- current, explicit evidence clearly states that the merchant does not offer an NHS discount or healthcare-worker discount

### Use a cautious form when:
- the evidence is indirect
- the evidence is mixed or incomplete
- the available offer is for unrelated groups such as first responders, military, veterans, teachers, students, or key workers only
- the offer is historical only
- healthcare or NHS eligibility is possible but not confirmed
- the only support comes from third-party cashback, coupons, aggregator listings, or portal mentions that do not clearly confirm a merchant-run NHS or healthcare-worker discount

Absence of evidence is not enough for `No,`

## NHS Boundary Rules

Treat these carefully:

- **Explicit NHS mention** -> `Yes,`
- **Healthcare-worker, nurse, doctor, clinician, hospital staff, or medical professional discount** -> `Yes,`
- **Healthcare discount explicitly including NHS staff** -> `Yes,`
- Keep positive answers in the form `Yes, [Brand] ...`
- **First responders, military, veterans, teachers, students, or generic key workers only** -> cautious form
- **COVID-era or past temporary support only** -> cautious form
- **Third-party cashback, coupon, or portal savings for medical professionals without a clearly confirmed merchant-run NHS or healthcare-worker discount** -> cautious form

Do not downgrade a clearly healthcare-related discount to cautious just because NHS staff are not named explicitly.
Do not upgrade a third-party savings mention to `Yes,` unless the merchant offer itself is clearly confirmed.

## Writing Rules

Always:

- answer the question in the first sentence
- include the merchant name
- include the phrase `NHS discount` when natural
- use simple present tense
- prefer 2 short sentences when a supporting fact improves clarity
- use 1 sentence only when no reliable supporting detail adds value
- keep the answer compact and usually under 50 words

Keep only the most useful facts:

1. whether the merchant offers an NHS discount
2. discount amount, if clearly supported
3. eligible healthcare or NHS-related group, if clearly supported
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

Prioritize these details in this order:

1. discount value
2. discount group
3. verification method or access path
4. where the discount applies
5. one central restriction

Examples:
- `10% off for NHS staff and healthcare workers`
- `up to 15% off for nurses and medical professionals`
- `available through Blue Light Card`
- `verified through Health Service Discounts`
- `applies to full-priced items only`

Do not add or infer details that are not clearly supported.
Do not present third-party cashback, coupon, or portal offers as if they were confirmed merchant-run NHS discounts unless the evidence clearly says so.

## Discount Value Rules

Use discount values conservatively.

- If a specific value is clearly supported, include it in the first sentence.
- If the wording is `up to X%`, keep `up to X%`. Do not simplify it to `X%`.
- If multiple values apply to different categories, use the broadest clearly supported value only if it is the main offer.
- If the value is inconsistent or unclear, omit it.
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

### Positive: explicit NHS or healthcare-worker discount
`Yes, [Brand] offers a [X%] NHS discount for eligible NHS staff or healthcare workers. Verification is usually required through [platform].`

### Positive: healthcare-group wording
`Yes, [Brand] offers an NHS discount for healthcare workers, such as nurses, doctors, or other medical staff. It is usually available through [platform or portal].`

### Positive: NHS discount with offer scope
`Yes, [Brand] offers a [X%] NHS discount for eligible healthcare staff. It typically applies to [main product scope or purchase type].`

### Positive: NHS discount with important restriction
`Yes, [Brand] offers a [X%] NHS discount for eligible healthcare workers. [Key restriction], such as [minimum order, member requirement, or exclusions], may apply.`

### Positive: cautious value wording
`Yes, [Brand] offers up to [X%] off for eligible NHS staff or healthcare workers. Verification is usually required through [platform].`

### Negative: explicit no
`No, [Brand] does not offer an NHS discount. No dedicated NHS or healthcare-worker offer is currently advertised.`

### Unclear: no explicit NHS or healthcare discount
`[Brand] does not clearly advertise a dedicated NHS discount. The available offer does not clearly confirm healthcare or NHS eligibility.`

### Unclear: related non-NHS offer only
`An NHS discount is not clearly confirmed for [Brand]. It mainly promotes discounts for [first responders, military personnel, teachers, students, or another supported group] instead.`

### Unclear: historical or indirect support only
`[Brand] does not appear to offer a dedicated NHS discount. The available information points to past or indirect offers instead.`

### Unclear: alternate cautious opening
`A standard NHS discount is not clearly available at [Brand]. The clearly supported offer appears to target a different group instead.`

Do not add generic advice, source references, or promotional wording.

## Second-Sentence Rules

Use the second sentence to add only one type of supporting detail.

Choose this priority order:

1. discount value
2. who qualifies
3. verification method or access path
4. where the discount applies
5. one central restriction
6. related non-NHS offer category

### Good second-sentence content

Use:
- `It covers NHS staff, nurses, and other healthcare workers.`
- `Verification is usually required through Blue Light Card or Health Service Discounts.`
- `It typically applies to full-priced items.`
- `A minimum order may apply.`
- `The offer is aimed at healthcare workers rather than a broader public group.`
- `It mainly applies to first responders and military personnel.`
- `Eligible shoppers usually verify through Gocertify or a partner platform.`
- `The offer is generally available through a verified discount portal.`

### Do not use the second sentence for:
- recommendations to visit the website
- source names
- dates unless essential
- multiple restrictions in one sentence
- extra savings unrelated to the main answer
- unsupported expansion beyond clearly supported healthcare-related groups

## Opening Pattern Rules

Use one of these opening forms only:

- `Yes, [Brand] ...`
- `No, [Brand] ...`
- `[Brand] does not clearly advertise a dedicated NHS discount.`
- `An NHS discount is not clearly confirmed for [Brand].`
- `[Brand] does not appear to offer a dedicated NHS discount.`
- `A standard NHS discount is not clearly available at [Brand].`

Do not start with:

- `Maybe`
- `It may or may not`

If the second sentence does not improve clarity, omit it.

The `Yes,` and `No,` opening pattern is safe in `.xlsx` outputs because the full answer remains in one cell. Avoid plain `.csv` unless fields are correctly quoted.

## Unclear Answer Rule

When the answer is unclear, the second sentence should explain the nearest supported offer category and, when possible, include specific details such as the actual discount group, value, or access path.

Examples:
- `[Brand] does not clearly advertise a dedicated NHS discount. It promotes discounts for first responders and military personnel instead.`
- `An NHS discount is not clearly confirmed for [Brand]. The available offer is for students rather than healthcare workers.`
- `[Brand] does not appear to offer a dedicated NHS discount. The evidence points to a related key worker offer instead.`
- `An NHS discount is not clearly confirmed for [Brand]. The available savings point to third-party cashback or portal offers for medical professionals instead.`

## Atomic Facts Rules

Each sentence should make one clear claim.

Do not:

- combine multiple uncertain claims in one sentence
- infer unsupported eligibility from weak evidence
- overstate unrelated group discounts as NHS discounts
- mix current and historical claims in the same sentence

If evidence is mixed, prefer the cautious form.

## Market and Language Rules

Match the output language to the user's requested language or target market.

- For UK English pages, keep `NHS discount`
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
  `Yes, [Brand] offers a [X%] NHS discount for eligible NHS staff or healthcare workers. Verification is usually required through [platform if clearly supported].`

- positive with amount  
  `Yes, [Brand] offers a [currency][X] NHS discount for eligible healthcare workers. Eligibility or verification may apply.`

- positive with threshold  
  `Yes, [Brand] offers an NHS discount on qualifying orders over [currency][X] for eligible healthcare workers. Eligibility or product restrictions may apply.`

- negative  
  `No, [Brand] does not offer an NHS discount. No dedicated NHS or healthcare-worker offer is currently advertised.`

- unclear  
  `[Brand] does not clearly advertise a dedicated NHS discount. The available offer does not clearly confirm healthcare or NHS eligibility.`

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
- `Subclass`: use the current subclass route, which for this skill is `nhs`
- `板块名称`: default to `faq`
- `Titile1`: `Does [Brand] offer NHS discount?`
- `Brief Introduction`: use 1-2 short sentences based on the supported facts
- `Href Kw` and `Href Url`: leave blank unless explicitly provided

### `Brief Introduction` patterns

- positive  
  `Yes, [Brand] offers a [X%] NHS discount for eligible NHS staff or healthcare workers. It is usually available through [platform if supported].`

- negative  
  `No, [Brand] does not offer an NHS discount. No dedicated NHS or healthcare-worker offer is currently advertised.`

- unclear  
  `[Brand] does not clearly advertise a dedicated NHS discount. The available offer does not clearly confirm healthcare or NHS eligibility.`

## Good Examples

`Yes, Dell offers a 10% NHS discount for eligible NHS staff and healthcare workers. It is usually available through Blue Light Card or Health Service Discounts.`

`Yes, Nike offers a 10% NHS discount for eligible healthcare workers. Nike membership is usually required.`

`4 Wheel Parts does not clearly advertise a dedicated NHS discount. It mainly promotes discounts for first responders, military personnel, and veterans instead.`

`Frames Direct does not appear to offer a dedicated NHS discount. Its clearly supported offer is for a different group rather than healthcare staff.`

## Bad Examples

- `Yes, according to multiple sources, the brand currently appears to offer a special deal.`
- `The brand proudly supports heroes with an amazing NHS offer.`
- `Yes. NHS staff, teachers, students, and many others can all save in different ways.`
- `Yes. Visit the official website to check the latest terms.`
- `It may or may not offer an NHS discount depending on your region and eligibility.`
- `Yes. The discount may be 10%, 15%, or 20% depending on the item.`

## Final Checklist

Before answering, confirm that:

- the first sentence directly answers the question
- the merchant name is included
- healthcare-related groups can be treated as NHS-related support when the merchant discount itself is clearly confirmed
- third-party cashback, coupon, or portal mentions alone are not upgraded to `Yes,`
- the discount value appears only when clearly supported
- `No,` is used only for explicit negative evidence
- unclear or indirect evidence uses a cautious form with the merchant name in the first sentence
- the answer includes specific details such as discount group, value, or application condition when clearly supported
- the second sentence adds only one useful supporting detail
- the wording is compact, factual, readable, and SEO-friendly
- the total answer is usually under 50 words
