#!/usr/bin/env python3
import argparse
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

OUTPUT_HEADERS = [
    "ContentType",
    "Country",
    "TermID",
    "TermName",
    "Domain",
    "Source",
    "Subclass",
    "板块名称",
    "Titile1",
    "Brief Introduction",
    "Href Kw",
    "Href Url",
]


def _column_name(index: int) -> str:
    name = ""
    while index > 0:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def _normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").strip().lower())


def _read_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    values = []
    for item in root.findall("main:si", NS):
        texts = [node.text or "" for node in item.findall(".//main:t", NS)]
        values.append("".join(texts))
    return values


def _read_sheet_rows(path: Path) -> list[list[str]]:
    with zipfile.ZipFile(path) as zf:
        shared = _read_shared_strings(zf)
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        sheets = workbook.find("main:sheets", NS)
        first_sheet = sheets[0]
        rid = first_sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        sheet_path = "xl/" + rel_map[rid]
        sheet_root = ET.fromstring(zf.read(sheet_path))

        rows = []
        for row in sheet_root.findall(".//main:sheetData/main:row", NS):
            cells = {}
            max_col = 0
            for cell in row.findall("main:c", NS):
                ref = cell.attrib.get("r", "")
                letters = "".join(ch for ch in ref if ch.isalpha())
                col_num = 0
                for ch in letters:
                    col_num = col_num * 26 + (ord(ch.upper()) - 64)
                max_col = max(max_col, col_num)
                value = ""
                cell_type = cell.attrib.get("t")
                if cell_type == "inlineStr":
                    node = cell.find("main:is", NS)
                    if node is not None:
                        value = "".join(t.text or "" for t in node.findall(".//main:t", NS))
                else:
                    node = cell.find("main:v", NS)
                    if node is not None:
                        value = node.text or ""
                        if cell_type == "s":
                            try:
                                value = shared[int(value)]
                            except (ValueError, IndexError):
                                value = ""
                cells[col_num] = value
            if max_col:
                rows.append([cells.get(i, "") for i in range(1, max_col + 1)])
        return rows


def _pick(row: dict[str, str], *names: str) -> str:
    for name in names:
        if name in row and row[name] != "":
            return row[name]
    return ""


def cmd_extract(args: argparse.Namespace) -> int:
    rows = _read_sheet_rows(Path(args.input))
    if not rows:
        raise SystemExit("No rows found in input workbook.")

    headers = rows[0]
    norm = {_normalize_header(header): idx for idx, header in enumerate(headers)}

    def get_value(values: list[str], *candidates: str) -> str:
        for candidate in candidates:
            idx = norm.get(_normalize_header(candidate))
            if idx is not None and idx < len(values):
                return values[idx]
        return ""

    extracted = []
    for values in rows[1:]:
        country = get_value(values, "country")
        term_name = get_value(values, "term_name", "termname")
        discount_details = get_value(values, "discount_details", "discountdetails")
        if not any([country, term_name, discount_details]):
            continue
        extracted.append(
            {
                "country": country,
                "term_id": get_value(values, "term_id", "termid"),
                "term_name": term_name,
                "domain": get_value(values, "domain"),
                "discount_details": discount_details,
            }
        )

    Path(args.output).write_text(json.dumps(extracted, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(extracted)} rows to {args.output}")
    return 0


def _inline_cell(cell_ref: str, value: str) -> str:
    safe = escape(value or "")
    return (
        f'<c r="{cell_ref}" t="inlineStr"><is><t xml:space="preserve">{safe}</t></is></c>'
    )


def _build_sheet_xml(records: list[dict[str, str]]) -> str:
    rows_xml = []
    all_rows = [OUTPUT_HEADERS]
    for record in records:
        all_rows.append([record.get(header, "") for header in OUTPUT_HEADERS])

    for row_idx, values in enumerate(all_rows, start=1):
        cells = []
        for col_idx, value in enumerate(values, start=1):
            cells.append(_inline_cell(f"{_column_name(col_idx)}{row_idx}", str(value)))
        rows_xml.append(f'<row r="{row_idx}">{"".join(cells)}</row>')

    dimension = f"A1:{_column_name(len(OUTPUT_HEADERS))}{len(all_rows)}"
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="{dimension}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <sheetData>{''.join(rows_xml)}</sheetData>
</worksheet>
'''


def cmd_build(args: argparse.Namespace) -> int:
    records = json.loads(Path(args.input).read_text(encoding="utf-8"))
    normalized = []
    for item in records:
        row = {
            "ContentType": _pick(item, "ContentType", "contenttype") or "faq",
            "Country": _pick(item, "Country", "country"),
            "TermID": _pick(item, "TermID", "term_id", "termid"),
            "TermName": _pick(item, "TermName", "term_name", "termname"),
            "Domain": _pick(item, "Domain", "domain"),
            "Source": _pick(item, "Source", "source") or "AI",
            "Subclass": _pick(item, "Subclass", "subclass") or "teacher discount",
            "板块名称": _pick(item, "板块名称", "section_name") or "faq",
            "Titile1": _pick(item, "Titile1", "question", "title1"),
            "Brief Introduction": _pick(item, "Brief Introduction", "answer", "brief_introduction"),
            "Href Kw": _pick(item, "Href Kw", "href_kw"),
            "Href Url": _pick(item, "Href Url", "href_url"),
        }
        normalized.append(row)

    workbook_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>
"""
    rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
"""
    root_rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
"""
    content_types_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>
"""
    styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>
"""

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", root_rels_xml)
        zf.writestr("xl/workbook.xml", workbook_xml)
        zf.writestr("xl/_rels/workbook.xml.rels", rels_xml)
        zf.writestr("xl/styles.xml", styles_xml)
        zf.writestr("xl/worksheets/sheet1.xml", _build_sheet_xml(normalized))

    print(f"Wrote {len(normalized)} rows to {args.output}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Extract input rows and build FAQ output workbooks.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    extract = subparsers.add_parser("extract", help="Read an input xlsx and export relevant fields as JSON.")
    extract.add_argument("--input", required=True, help="Path to the source xlsx file.")
    extract.add_argument("--output", required=True, help="Path to the extracted JSON file.")
    extract.set_defaults(func=cmd_extract)

    build = subparsers.add_parser("build", help="Create the final FAQ xlsx from reviewed JSON.")
    build.add_argument("--input", required=True, help="Path to the reviewed JSON file.")
    build.add_argument("--output", required=True, help="Path to the output xlsx file.")
    build.set_defaults(func=cmd_build)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
