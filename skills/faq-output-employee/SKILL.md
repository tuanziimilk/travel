name: employee-discount-faq-answer
description: Use when rewriting employee discount FAQ answers for HotDeals or similar SEO pages from collected search snippets or structured fields. Produces concise, atomic-fact answers that are readable, AI-search friendly, and consistent across merchants.
# Employee Discount FAQ Answer
Use this skill when the user provides merchant-level snippets or structured fields and wants a final FAQ answer such as `Does [Brand] offer an employee discount?`
## Goal
Turn noisy source material into one compact answer that is:
- direct and factual
- SEO-friendly and AI-search friendly
- aligned with atomic facts
- consistent across merchants
- usually under 50 words
## Input Types
Typical inputs:
- the question, usually `Does [Brand] offer an employee discount?`
- snippets, summaries, or AI Overview text
- structured fields such as `term_id`, `country`, `domain`, `term_name`, `fact_type`, `supported`, `status`, `discount_type`, `discount_value`, `currency`, `discount_details`, and `url`
## Source Priority
When evidence conflicts, use this order:
1. Structured fields such as `supported`, `discount_type`, and `discount_value`
2. Official merchant wording that explicitly names an employee discount, staff discount, or employee purchase program
3. Official merchant wording that clearly limits the offer to employees, staff members, or team members
4. Reliable third-party snippets with explicit employee-discount support
5. Indirect, inferred, historical, or mixed evidence
Do not override clear structured fields with weaker snippet language.
## Output Modes
### Answer mode
Return the final answer only unless the user explicitly asks for analysis or rows.
Do not add:
- citations
- source names
- reasoning
- labels such as `Answer:`
### Upload-sheet mode
When the user asks for upload-ready output, return:
`term_id,country,domain,term_name,fact_type,supported,status,discount_type,discount_value,currency,discount_details,url`
### FAQ-row mode
When the user asks for content-output rows, return:
`ContentType,Country,TermID,TermName,Domain,Source,Subclass,鏉垮潡鍚嶇О,Titile1,Brief Introduction,Href Kw,Href Url`
## Core Decision Logic
Use `Yes,` when:
- evidence clearly supports an employee discount
- evidence clearly supports a staff, team-member, colleague, or employee purchase program for employees
Use `No,` only when:
- current explicit evidence clearly states the merchant does not offer an employee discount
Use a cautious form when:
- evidence is indirect, mixed, incomplete, or historical
- the offer is only for students, teachers, military, veterans, NHS staff, healthcare workers, key workers, or first responders
- the offer is only for members, subscribers, or app users
- the offer is only for business accounts, corporate customers, affiliates, or partners
- employee eligibility is possible but not confirmed
Absence of evidence is not enough for `No,`
## Employee Boundary Rules
- Explicit employee discount mention -> `Yes,`
- Explicit staff, team-member, colleague, or employee purchase program wording -> `Yes,`
- Offer clearly limited to employees of the merchant or a defined employer program -> `Yes,`
- Student, teacher, military, veteran, NHS, healthcare, first responder, or key worker discount only -> cautious form
- Loyalty-member, subscriber, or app-user discount only -> cautious form
- Corporate account, business pricing, affiliate, or partner program only -> cautious form
- Past or expired employee language only -> cautious form
Do not convert a membership, business, or partner offer into an employee discount unless employee eligibility is explicit.
## Writing Rules
Always:
- answer the question in the first sentence
- include the merchant name
- include `employee discount` when natural
- use simple present tense
- prefer 2 short sentences when a supporting fact improves clarity
- use 1 sentence when no reliable second sentence helps
- keep the answer compact and usually under 50 words
Keep only the most useful facts:
1. whether the merchant offers an employee discount
2. discount amount if clearly supported
3. eligible group if clearly supported
4. verification method or access path if clearly supported
5. one key restriction if central to eligibility
Remove:
- citations
- source names
- dates unless essential
- marketing wording
- recommendations
- repeated details
- unsupported claims
- unrelated savings information
## Numeric and Discount Value Rules
- If a supported number is clearly tied to the offer, prefer using it
- If wording is `up to X%`, keep `up to X%`
- If multiple values exist, use the broadest clearly supported main offer only
- If the value is unclear or inconsistent, omit it
- If the employee discount is unclear but a related non-employee offer has a supported value, that value may appear in sentence two to clarify what is actually available
- Mention thresholds, exclusions, or one-time-use limits only when central to eligibility
Do not infer numbers.
## Brand Rule
Use the merchant name from the query as the display brand. Do not replace it with a parent brand, sister site, or broader retailer name unless the relationship is explicit and clearly refers to the same merchant.
## Opening Patterns
Use only these openings:
- `Yes, [Brand] ...`
- `No, [Brand] ...`
- `[Brand] does not clearly advertise an employee discount.`
- `An employee discount is not clearly confirmed for [Brand].`
- `[Brand] does not appear to advertise a dedicated employee discount.`
- `A standard employee discount is not clearly available at [Brand].`
Do not start with:
- `Maybe`
- `It may or may not`
## Standard Answer Patterns
Use the shortest accurate form. Prefer two short sentences when helpful.
Positive:
`Yes, [Brand] offers a [X%] employee discount for eligible employees. It is usually available through [verification method or access path].`
`Yes, [Brand] offers an employee discount through its employee purchase program. Verification or staff eligibility is usually required.`
`Yes, [Brand] offers up to [X%] off for eligible employees. Verification is usually required through [platform].`
Negative:
`No, [Brand] does not offer an employee discount. No dedicated employee offer is currently advertised.`
Unclear:
`[Brand] does not clearly advertise an employee discount. Employee eligibility is not clearly confirmed.`
`[Brand] does not clearly advertise an employee discount. It mainly promotes [X%] off for [members, students, business customers, or another supported group] instead.`
`An employee discount is not clearly confirmed for [Brand]. The available offer appears to be [X%] off for business customers or partner accounts instead.`
`[Brand] does not appear to advertise a dedicated employee discount. The available information points to past or indirect offers instead.`
`A standard employee discount is not clearly available at [Brand]. The clearly supported savings appear to be for [members, subscribers, business customers, or partners] instead.`
## Second-Sentence Rule
Use sentence two for only one type of supporting detail. Choose in this order:
1. supported numeric detail
2. verification method or access path
3. who qualifies
4. where the discount applies
5. one key restriction
6. related non-employee offer category
Good sentence-two content:
- `Verification is usually required through an employee portal.`
- `It is usually available through the employee purchase program.`
- `It typically applies to full-priced items.`
- `A minimum order of $100 may apply.`
- `The offer is limited to employees or staff members.`
- `The available offer appears to be 10% off for members instead.`
- `It mainly applies to business customers with up to 15% off pricing.`
- `Eligible shoppers usually verify through a partner platform.`
- `A 20% partner discount is mentioned, but employee eligibility is not clearly confirmed.`
Do not use sentence two for recommendations, dates, source names, multiple restrictions, unrelated savings, or unsupported employee inference.
## Atomic Facts Rule
Each sentence should make one clear claim. Do not combine multiple uncertain claims, mix current and historical claims, or overstate weak evidence. If evidence is mixed, prefer the cautious form.
## Market and Language
Match the output language to the user's requested language or target market. For English pages, keep `employee discount`. For non-English output, preserve the merchant name and the original meaning. If market is unclear, follow the user's language.
## Upload-Sheet Rules
Field rules:
- `country`: if `MAIN`, output `us`; otherwise keep the source value
- `term_name`: merchant name only
- `fact_type`: keep the exact provided value
- `supported`: keep the normalized value such as `yes`, `no`, or `unknown`
- `status`: keep the provided value
- `discount_type`: keep the exact structured type
- `discount_value`: keep the core numeric or textual value only
- `currency`: fill only when required
- `discount_details`: write one short factual answer based on the structured facts
- `url`: keep the provided value if present
`discount_details` patterns:
- `Yes, [Brand] offers a [X%] employee discount for eligible employees. Verification is usually required through [platform if clearly supported].`
- `Yes, [Brand] offers a [currency][X] employee discount. Eligibility or verification may apply.`
- `Yes, [Brand] offers an employee discount on qualifying orders over [currency][X]. Eligibility or product restrictions may apply.`
- `No, [Brand] does not offer an employee discount. No dedicated employee offer is currently advertised.`
- `[Brand] does not clearly advertise an employee discount. The available offer appears to be [X%] off for [members, business customers, partners, or another supported group] instead.`
- `An employee discount is not clearly confirmed for [Brand]. It may offer related discounts for other groups instead.`
## FAQ Content Row Rules
Field rules:
- `Content`: default `faq`
- `Country`: if `MAIN`, output `us`; otherwise keep the source value
- `TermID`: input `term_id`
- `TermName`: merchant name only
- `Domain`: provided domain
- `Source`: default `Ai` unless provided otherwise
- `Subclass`: fixed to `employee`
- `鏉垮潡鍚嶇О`: default `faq`
- `Titile1`: `Does [Brand] offer an employee discount?`
- `Brief Introduction`: use 1-2 short sentences based on supported facts
- `Href Kw` and `Href Url`: leave blank unless provided
`Brief Introduction` patterns:
- `Yes, [Brand] offers a [X%] employee discount for eligible employees. It is usually available through [platform if supported].`
- `No, [Brand] does not offer an employee discount. No dedicated employee offer is currently advertised.`
- `[Brand] does not clearly advertise an employee discount. The available offer appears to be [X%] off for [members, business customers, partners, or another supported group] instead.`
- `An employee discount is not clearly confirmed for [Brand]. It may promote discounts for related groups instead.`
## Good Examples
`Yes, Apple offers an employee discount through its employee purchase program. Staff eligibility is usually required.`
`Yes, Lenovo offers an employee discount for eligible employees through its employee purchase program. Verification is usually required through the employer portal.`
`Nike does not clearly advertise an employee discount. It mainly promotes 10% off for students and members instead.`
`An employee discount is not clearly confirmed for Dell. The available offer appears to be business pricing rather than an employee-specific benefit.`
## Bad Examples
- `Yes, according to multiple sources, the brand currently appears to offer a special deal.`
- `The brand proudly rewards hard-working staff with an amazing employee offer.`
- `Yes. Employees, students, teachers, and many others can all save in different ways.`
- `Yes. Visit the official website to check the latest terms.`
- `It may or may not offer an employee discount depending on your region and eligibility.`
- `Yes. The discount may be 10%, 15%, or 20% depending on the item.`
## Final Checklist
Before answering, confirm:
- sentence one directly answers the question
- the merchant name is included
- the discount value appears only when clearly supported
- `No,` is used only for explicit negative evidence
- unclear evidence uses a cautious form
- a supported numeric detail is used when it adds value
- sentence two adds only one useful supporting detail
- the wording is compact, factual, readable, and usually under 50 words
