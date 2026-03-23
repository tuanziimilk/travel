name: first-order-discount-faq-answer
description: Use when rewriting first order discount FAQ answers for HotDeals or similar SEO pages from merchant snippets, AI overviews, or structured fields. Produces concise, atomic-fact answers or upload-ready rows about whether a brand offers a first order discount.
# First Order Discount FAQ Answer
Use this skill when the user provides merchant evidence and wants a final FAQ answer such as `Does [Brand] offer a first order discount?`
## Goal
Turn noisy snippets or structured discount data into one final answer that is:
- direct and factual
- easy to read
- SEO-friendly and AI-search friendly
- aligned with Atomic Facts
- consistent across merchants at scale
- usually under 50 words
## Inputs
Typical inputs:
- the target question
- merchant snippets, AI Overview text, or summary notes
- structured fields such as `term_id`, `country`, `domain`, `term_name`, `fact_type`, `supported`, `status`, `discount_type`, `discount_value`, `currency`, `discount_details`, `url`
## Output Modes
### Answer mode
Return only the final answer unless the user explicitly asks for analysis.
Do not include:
- reasoning
- citations
- source names
- labels such as `Answer:`
### Upload-sheet mode
When the user asks for upload-ready output, return fields in this order:
`term_id,country,domain,term_name,fact_type,supported,status,discount_type,discount_value,currency,discount_details,url`
### FAQ-row mode
When the user asks for content rows, return fields in this order:
`ContentType,Country,TermID,TermName,Domain,Source,Subclass,鏉垮潡鍚嶇О,Titile1,Brief Introduction,Href Kw,Href Url`
## Source Priority
When evidence conflicts, use this order:
1. structured fields such as `supported`, `discount_type`, and `discount_value`
2. official merchant wording that explicitly confirms a first order, first purchase, first-time customer, welcome, next-order-after-sign-up, or first app order offer
3. official wording that clearly limits the offer to a first order or first purchase
4. reliable third-party snippets with explicit first-order support
5. indirect, inferred, mixed, or historical evidence
Do not override clear structured fields with weaker snippet language.
When `discount_details` or the primary evidence explicitly opens with `Yes,`, treat that as strong positive support unless the same evidence clearly shows a merchant mismatch or says the offer is only historical or unavailable now.
## Core Decision Logic
### Use `Yes,` when
- the evidence clearly supports a first order discount
- the evidence clearly supports a first purchase, first-time customer, welcome, sign-up, next-order-after-sign-up, or first app order offer
- the offer is clearly limited to new customers on their first order or first purchase
- the benefit is provided as a percentage discount, fixed amount discount, reward, coupon, credit, or free item tied to the first order or first purchase
- the main evidence explicitly says `Yes,` and then gives a concrete first-order benefit, even if the benefit is tied to a card, sign-up, app registration, reward, or free shipping
### Use `No,` only when
- current evidence explicitly says the merchant does not offer a first order discount or first purchase offer
### Use a cautious form when
- the evidence does not clearly tie the offer to a first order, first purchase, first-time customer, next order, or first app order
- the offer is a general sign-up, app, referral, membership, promo-code, or card benefit without explicit first-order eligibility
- the offer is free shipping only and not clearly presented as a first-order savings offer
- the merchant or program in the evidence does not clearly match the queried brand
- the evidence is indirect, conflicting, or historical only
Absence of evidence is not enough for `No,`
## Boundary Rules
- explicit first order discount mention -> `Yes,`
- explicit first purchase, first-time customer, welcome offer, next-order-after-sign-up, or first app order wording -> `Yes,`
- newsletter, email, or text sign-up offer -> `Yes,` if it clearly applies to the first order or next order
- first app order offer -> `Yes,`
- free item, reward, coupon, or credit for the first order or first purchase -> `Yes,`
- account-creation offer -> `Yes,` if it clearly applies to the first order or first purchase
- app-only, sign-up-only, referral, member, student, military, NHS, healthcare, employee, or card-based savings -> cautious only when first-order eligibility is not explicit
- free shipping on a first order alone does not automatically qualify unless it is clearly framed as a first-order savings offer the page should count
- public promo codes, seasonal sales, and general discounts do not automatically qualify
- past or expired first-order wording should stay cautious unless current support is clear
Do not downgrade a clearly first-order-related offer to cautious just because it is triggered by sign-up, app use, account creation, reward delivery, or a free-item format.
## Writing Rules
Always:
- answer in the first sentence
- include the merchant name
- use `first order discount` when natural
- use simple present tense
- prefer 2 short sentences when one supporting fact improves clarity
- keep the answer compact and usually under 50 words
Keep only the most useful facts:
1. whether the merchant offers a first order discount
2. discount amount if clearly supported
3. eligible group if clearly supported
4. access path or trigger if clearly supported
5. one key restriction if central
Remove:
- citations and source names
- dates unless essential
- extra background
- marketing language
- recommendations
- unsupported claims
## Concrete Offer Preservation Rule
When the evidence includes a concrete first-order benefit format, keep that format in the final answer instead of replacing it with a generic summary.
When the merchant does not clearly offer a standard first order discount but the evidence includes concrete alternative savings, keep the concrete savings and numbers in the second sentence. Do not replace them with vague wording like `other ongoing offers` or `general savings`.
Examples of concrete formats to preserve:
- `10% off the first order`
- `$5 off the first purchase`
- `a free menu item for new users`
- `a reward usable on the first order`
- `15% off after email sign-up`
- `discount on the first app order`
Do not replace a supported concrete offer with a generic cautious description such as:
- `does not clearly advertise a standard first order discount`
- `appears to offer sign-up-based savings instead`
unless first-order eligibility is actually unclear.
If the answer stays cautious, the second sentence should still preserve the most merchant-specific supported detail, such as:
- `It instead offers up to 30% off multi-item purchases and 15% off for military members.`
- `The main new-customer perk is free shipping on a first order over $125 after email sign-up.`
- `The available offer is a 30-day free trial rather than a standard first order discount.`
## Discount Value Rules
- include a value only when clearly supported
- preserve `up to X%` as written
- if multiple values conflict or apply to different channels, use the broadest clearly supported main offer or omit the value
- mention minimum order, exclusions, app requirements, or one-time-use limits only if central to eligibility
## Standard Answer Patterns
### Positive: percentage or amount
`Yes, [Brand] offers a [X%] first order discount for eligible new customers. It usually applies to the first purchase only.`
`Yes, [Brand] offers a [$X] first order discount for eligible new customers. It usually applies to the first purchase only.`
### Positive: sign-up or welcome trigger
`Yes, [Brand] offers a first order discount through its email, text, or welcome offer. It usually applies to the first or next order only.`
`Yes, [Brand] offers a first order discount for new customers after sign-up. It usually applies to the first or next purchase only.`
### Positive: app-first-order trigger
`Yes, [Brand] offers a first order deal for new app users. It usually applies to the first app order only.`
### Positive: reward, coupon, credit, or free item
`Yes, [Brand] offers a first order discount for new customers. The benefit may come as a reward, coupon, credit, or free item on the first purchase.`
### Positive: preserve a concrete format when supported
`Yes, [Brand] offers a first order discount for new users. It usually comes as a free menu item, reward, or discount tied to the first purchase.`
### Explicit negative
`No, [Brand] does not offer a first order discount. No dedicated first purchase offer is currently advertised.`
### Cautious
`[Brand] does not clearly advertise a first order discount. It may offer general savings, but first-order eligibility is not clearly confirmed.`
`[Brand] does not clearly advertise a first order discount. The available offer appears to be a general sign-up, app, or member benefit instead.`
`[Brand] does not clearly advertise a first order discount. The main savings appear to be tied to a branded credit card instead.`
`[Brand] does not clearly advertise a first order discount. The available savings appear to come from general promo codes or sales instead.`
`A first order discount is not clearly confirmed for [Brand]. The available evidence refers to a different merchant or program.`
## Second Sentence Priority
Use at most one type of support detail, in this order:
1. access path or trigger
2. who qualifies
3. where the discount applies
4. one central restriction
5. related non-first-order savings category
6. merchant or program mismatch clarification
Good examples:
- `It usually applies to the first purchase only.`
- `New-customer eligibility is usually required.`
- `The offer is typically revealed after email or text sign-up.`
- `It usually applies to the first app order only.`
- `The benefit comes as a free item or reward on the first purchase.`
- `A minimum order may apply.`
- `The main savings appear to be tied to a branded credit card instead.`
Do not use the second sentence for recommendations, dates, multiple restrictions, or unrelated savings.
## Opening Variety
Match the opening to the evidence type instead of repeating one cautious pattern for every merchant.
Useful opening families:
- `Yes, [Brand] ...`
- `No, [Brand] ...`
- `[Brand] does not clearly advertise a first order discount.`
- `A first order discount is not clearly advertised by [Brand].`
- `[Brand] appears to offer general sign-up or app-based savings rather than a clearly confirmed first order discount.`
- `A standard first-order offer is not clearly confirmed for [Brand].`
Do not start with vague hedges such as `Maybe` or `It may or may not`.
## Atomic Facts
Each sentence should make one clear claim.
Do not:
- combine multiple uncertain claims in one sentence
- infer first-order eligibility from weak evidence
- overstate sign-up, app, referral, card, member, or promo-code offers when first-order eligibility is not explicit
- mix current and historical claims in the same sentence
If evidence is mixed, prefer the cautious form.
## Upload-Sheet Rules
For upload-ready rows:
- `country`: convert `MAIN` to `us`; otherwise keep the original value
- `term_name`: merchant name only
- `fact_type`: keep exact input value
- `supported`: keep normalized value such as `yes`, `no`, or `unknown`
- `status`: keep input value
- `discount_type`: keep exact structured type
- `discount_value`: keep the core numeric or textual value only
- `currency`: fill only when needed
- `discount_details`: write one short factual answer using the structured facts
- `url`: keep the provided value if present
`discount_details` patterns:
- positive percent: `Yes, [Brand] offers a [X%] first order discount for eligible new customers. It usually applies to the first purchase only.`
- positive amount: `Yes, [Brand] offers a [currency][X] first order discount for eligible new customers. It usually applies to the first purchase only.`
- positive trigger: `Yes, [Brand] offers a first order discount through its email, text, app, or welcome offer. It usually applies to the first or next order only.`
- positive concrete format: `Yes, [Brand] offers a first order discount for new customers. The benefit may come as a reward, coupon, credit, or free item on the first purchase.`
- negative: `No, [Brand] does not offer a first order discount. No dedicated first purchase offer is currently advertised.`
- unclear: `[Brand] does not clearly advertise a first order discount. It may offer related sign-up, app, referral, member, card, or general savings instead.`
## FAQ-Row Rules
For content rows:
- `Content`: default `faq`
- `Country`: convert `MAIN` to `us`; otherwise keep original value
- `TermID`: use `term_id`
- `TermName`: merchant name only
- `Domain`: use provided domain
- `Source`: default `Ai` unless the user provides another value
- `Subclass`: fixed to `newsletter/first order/sign up`
- `鏉垮潡鍚嶇О`: default `faq`
- `Titile1`: `Does [Brand] offer a first order discount?`
- `Brief Introduction`: write 1-2 short sentences using the supported facts
- `Href Kw` and `Href Url`: leave blank unless explicitly provided
### `Brief Introduction` patterns
- positive percent: `Yes, [Brand] offers a [X%] first order discount for eligible new customers. It usually applies to the first purchase only.`
- positive trigger: `Yes, [Brand] offers a first order discount through its sign-up, app, or welcome offer. It usually applies to the first or next order only.`
- positive concrete format: `Yes, [Brand] offers a first order discount for new customers. The benefit may come as a reward, coupon, credit, or free item on the first purchase.`
- negative: `No, [Brand] does not offer a first order discount. No dedicated first purchase offer is currently advertised.`
- unclear: `[Brand] does not clearly advertise a first order discount. It may offer related sign-up, app, referral, card, member, or general savings instead.`
## Workflow
1. Identify the merchant name from the user's query and keep it unchanged.
2. Determine the output mode.
3. Read structured fields first if present.
4. Check whether the evidence explicitly ties the benefit to a first order, first purchase, first-time customer, next order after sign-up, or first app order.
5. If the main evidence explicitly says `Yes,`, default to `Yes,` unless the same evidence clearly shows a mismatch or says the offer is no longer current.
6. If yes, classify it as `Yes,` even if the trigger is sign-up, app use, account creation, reward delivery, coupon, credit, free item, card approval, or free shipping.
7. Preserve concrete offer wording and numbers when clearly supported.
8. If the answer is cautious, use the second sentence to keep the most useful concrete merchant-specific savings detail instead of generic fallback wording.
9. If outputting rows, preserve the requested field order exactly.
## Final Checks
Before answering, confirm:
- the first sentence directly answers the question
- the merchant name is included
- the discount value appears only when clearly supported
- `No,` is used only for explicit negative evidence
- unclear or indirect evidence uses a cautious form
- sign-up, app, referral, card, member, and promo offers are not overstated unless first-order eligibility is explicit
- an explicit `Yes,` in the main evidence is not downgraded without a clear mismatch or historical-only conflict
- clearly first-order-related offers are classified as `Yes,`
- concrete supported offer formats are preserved instead of replaced by generic wording
- the second sentence adds only one useful support detail
- the result is compact, factual, readable, and SEO-friendly
