---
name: senior-discount-faq-answer
description: Use when writing or rewriting merchant senior discount FAQ answers from snippets or structured fields for SEO pages, upload sheets, or FAQ rows. Produces short, atomic-fact answers with cautious handling of unclear evidence.
---

# Senior Discount FAQ Answer

Use this skill when the input is merchant-level evidence and the target output is a final answer to a question like `Does [Brand] offer a senior discount?`

## What To Produce

Choose one mode based on the user's request:

- `answer mode`: return only the final answer
- `upload-sheet mode`: return `term_id,country,domain,term_name,fact_type,supported,status,discount_type,discount_value,currency,discount_details,url`
- `faq-row mode`: return `ContentType,Country,TermID,TermName,Domain,Source,Subclass,板块名称,Titile1,Brief Introduction,Href Kw,Href Url`

Unless the user asks for analysis, do not include reasoning, labels, citations, or source names.

## Source Priority

When evidence conflicts, use this order:

1. Structured fields such as `supported`, `discount_type`, `discount_value`, and `status`
2. Official merchant wording that explicitly mentions a senior discount
3. Official wording that clearly names seniors, retirees, older adults, or thresholds like `55+`, `60+`, `62+`, `65+`
4. Official wording that explicitly says the offer is available through AARP or a dedicated senior program
5. Reliable third-party wording with explicit senior support
6. Indirect, historical, mixed, or inferred evidence

Do not let weak snippets override clear structured fields.

## Decision Rules

Use `Yes,` when:

- a senior discount is explicitly supported
- an age-based senior offer is explicitly supported
- eligibility through AARP or a dedicated senior program is explicitly supported

Use `No,` only when:

- current evidence explicitly says the merchant does not offer a senior discount

Use a cautious form when:

- evidence is indirect, mixed, incomplete, or historical
- the offer is only for members, subscribers, app users, newsletter users, or club users
- the offer is only for students, teachers, military, veterans, NHS, healthcare workers, first responders, employees, or key workers
- there is age-adjacent language but senior eligibility is not actually confirmed

Absence of evidence is not enough for `No,`

## Opening Forms

Start with one of these only:

- `Yes, [Brand] ...`
- `No, [Brand] ...`
- `[Brand] does not clearly advertise a dedicated senior discount.`
- `A senior discount is not clearly confirmed for [Brand].`
- `[Brand] does not appear to offer a dedicated senior discount.`
- `A standard senior discount is not clearly available at [Brand].`

Do not start with `Maybe` or `It may or may not`.

## Writing Rules

Always:

- answer in the first sentence
- include the merchant name
- use `senior discount` when natural
- use simple present tense
- keep the answer compact, usually under 50 words
- use 2 short sentences only when the second sentence adds one useful supported detail

Keep only the strongest facts:

1. whether the senior discount exists
2. discount value, if clearly supported
3. age threshold or eligible group, if clearly supported
4. verification method or access path, if clearly supported
5. one important restriction, if central

Remove dates, recommendations, background, marketing language, repeated details, and unsupported claims.

## Detail Rules

Use specific details only when clearly supported.

Priority for the second sentence:

1. numeric detail
2. eligible group or age threshold
3. verification method or access path
4. where the offer applies
5. one central restriction
6. nearest supported non-senior offer category

If a discount value is stated as `up to X%`, keep `up to X%`.
If values conflict or are unclear, omit them.

## Boundary Rules

Treat these as `Yes,`:

- explicit `senior discount`
- explicit retiree, older adult, or age-threshold support such as `55+`, `60+`, `62+`, `65+`
- explicit AARP or dedicated senior-program eligibility

Treat these as cautious only:

- membership or rewards pricing without explicit senior support
- student, teacher, military, veteran, NHS, healthcare, employee, or first-responder offers only
- AARP-adjacent language without confirmed senior eligibility
- past or expired senior language

Do not infer senior eligibility from weak age-adjacent or membership wording.

## Standard Patterns

Positive:

`Yes, [Brand] offers a [X%] senior discount for eligible seniors. Verification is usually required through [platform if clearly supported].`

`Yes, [Brand] offers a [X%] senior discount for shoppers aged [age]+. It typically applies to [main scope if clearly supported].`

`Yes, [Brand] offers a senior discount through AARP or a dedicated senior program. Eligibility verification is usually required.`

Negative:

`No, [Brand] does not offer a senior discount. No dedicated senior offer is currently advertised.`

Unclear:

`[Brand] does not clearly advertise a dedicated senior discount. Senior eligibility is not clearly confirmed.`

`A senior discount is not clearly confirmed for [Brand]. It mainly promotes [X%] off for [supported group] instead.`

`[Brand] does not appear to offer a dedicated senior discount. A [member or other group] offer is mentioned, but senior eligibility is not explicitly named.`

`A standard senior discount is not clearly available at [Brand]. The available information points to past or indirect offers instead.`

## Atomic Facts

Each sentence should make one clear claim.

Do not:

- combine multiple uncertain claims in one sentence
- mix current and historical claims in one sentence
- overstate member or rewards offers as senior offers

If evidence is mixed, prefer the cautious form.

## Market And Language

- Match the user's requested language or target market
- For English output, keep `senior discount`
- Preserve the merchant name exactly as given in the query
- Do not replace the merchant with a parent or sister brand unless the relationship is explicit and clearly the same merchant

## Upload-Sheet Rules

Field rules:

- `country`: if input is `MAIN`, output `us`; otherwise keep the source value
- `term_name`: merchant name only
- `fact_type`: keep exact input
- `supported`: keep exact normalized value such as `yes`, `no`, `unknown`
- `status`: keep input
- `discount_type`: keep exact structured type
- `discount_value`: keep the core value only
- `currency`: fill only when required
- `url`: keep the source value if present

For `discount_details`, use one short factual answer:

- positive percent: `Yes, [Brand] offers a [X%] senior discount for eligible seniors. Verification is usually required through [platform if clearly supported].`
- positive amount: `Yes, [Brand] offers a [currency][X] senior discount. Eligibility or verification may apply.`
- positive threshold: `Yes, [Brand] offers a senior discount for shoppers aged [X]+. Eligibility or product restrictions may apply.`
- negative: `No, [Brand] does not offer a senior discount. No dedicated senior offer is currently advertised.`
- unclear with numeric detail: `[Brand] does not clearly advertise a dedicated senior discount. The available offer appears to be [X%] off for [supported group] instead.`
- unclear generic: `A senior discount is not clearly confirmed for [Brand]. It may offer related discounts for other groups instead.`

## FAQ-Row Rules

Field rules:

- `ContentType`: `faq`
- `Country`: if input is `MAIN`, output `us`; otherwise keep the source value
- `TermID`: input `term_id`
- `TermName`: merchant name only
- `Domain`: provided domain
- `Source`: default `AI` unless provided
- `Subclass`: the current subclass route, which for this skill is `senior`
- `板块名称`: `faq`
- `Titile1`: `Does [Brand] offer a senior discount?`
- `Href Kw` and `Href Url`: leave blank unless explicitly provided

For `Brief Introduction`, use 1 to 2 short sentences:

- positive: `Yes, [Brand] offers a [X%] senior discount for eligible seniors. It is usually available through [platform if supported].`
- negative: `No, [Brand] does not offer a senior discount. No dedicated senior offer is currently advertised.`
- unclear with numeric detail: `[Brand] does not clearly advertise a dedicated senior discount. The available offer appears to be [X%] off for [supported group] instead.`
- unclear generic: `A senior discount is not clearly confirmed for [Brand]. It may promote discounts for related groups instead.`

## Final Check

Before answering, confirm:

- the first sentence directly answers the question
- the merchant name is included
- `No,` is used only for explicit negative evidence
- discount values appear only when clearly supported
- unclear cases stay cautious
- the second sentence adds only one useful detail
- the wording is factual, compact, and readable
