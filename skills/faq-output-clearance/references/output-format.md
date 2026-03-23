# Output Format
Use this file as the canonical FAQ export contract for the current project.

## Required Output Columns
The workbook must contain these columns in this exact order:

1. `ContentType`
2. `Country`
3. `TermID`
4. `TermName`
5. `Domain`
6. `Source`
7. `Subclass`
8. `板块名称`
9. `Titile1`
10. `Brief Introduction`
11. `Href Kw`
12. `Href Url`

## Fixed Values
- `ContentType` = `faq`
- `Source` = `AI`
- `Subclass` = `clearance`
- `板块名称` = `faq`
- `Href Kw` = blank
- `Href Url` = blank

## Rules
- Keep only facts that belong to the current subclass: `clearance`
- Keep the final column names, order, and casing exactly as listed above
- `Titile1` must be the FAQ question for the current subclass
- `Brief Introduction` must stay factual and should not add unsupported content