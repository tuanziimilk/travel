import iconv from "iconv-lite";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { GG_COLLECTED_SOURCE_COLUMN, GG_COLLECTED_STATUS_COLUMN } from "./collectedSchema";
import { executeGgCleaningChunkRows, executeGgCleaningForEval, previewGgCleaningChunkRows, previewGgCleaningFile } from "./engine";

function toCollectedRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    task_id: String(row.task_id || ""),
    query: String(row.query || ""),
    country: String(row.country || ""),
    language: String(row.language || ""),
    domain: String(row.domain || ""),
    term_id: String(row.term_id || row.termid || row.TermID || ""),
    term_name: String(row.term_name || row.term || row["Term Name"] || ""),
    subclass: String(row.subclass || row.fact_type || row["fact type"] || ""),
    bu: String(row.bu || ""),
    [GG_COLLECTED_STATUS_COLUMN]: String(row[GG_COLLECTED_STATUS_COLUMN] || row.status || ""),
    [GG_COLLECTED_SOURCE_COLUMN]: String(row[GG_COLLECTED_SOURCE_COLUMN] || row.source_type || row.chosen_source_type || row.source || ""),
    google_url: String(row.google_url || ""),
    content: Array.isArray(row.content) ? row.content : [String(row.snippet || row.raw_snippet || row.discount_details || row.summary || row.answer || row.content || "")],
    product_urls: Array.isArray(row.product_urls) ? row.product_urls : row.url ? [row.url] : [],
    updated_time: String(row.updated_time || ""),
  }));
}

function runEval(rows: Array<Record<string, unknown>>, fileName = "fixture.json") {
  const fileBase64 = Buffer.from(JSON.stringify(toCollectedRows(rows)), "utf8").toString("base64");
  return executeGgCleaningForEval({ fileName, fileBase64 }, { skipFileSizeLimit: true });
}

function runEvalWithCollectedRows(rows: Array<Record<string, unknown>>, fileName = "fixture.json") {
  const fileBase64 = Buffer.from(JSON.stringify(rows), "utf8").toString("base64");
  return executeGgCleaningForEval({ fileName, fileBase64 }, { skipFileSizeLimit: true });
}

function runEvalWithFile(fileName: string, content: Buffer | string) {
  const fileBase64 = Buffer.isBuffer(content) ? content.toString("base64") : Buffer.from(content, "utf8").toString("base64");
  return executeGgCleaningForEval({ fileName, fileBase64 }, { skipFileSizeLimit: true });
}

describe("gg cleaning engine", () => {
  it("converges unknown shipping snippets into yes when free shipping evidence exists", () => {
    const result = runEval([
      {
        term_id: "1",
        country: "US",
        term_name: "Shop A",
        domain: "shopa.com",
        subclass: "shipping",
        source_type: "aimode",
        snippet: "Shop A offers free shipping on orders over $50 in the US.",
      },
      {
        term_id: "1",
        country: "US",
        term_name: "Shop A",
        domain: "shopa.com",
        subclass: "shipping",
        source_type: "searchlab",
        snippet: "Shipping policy: free delivery for orders over $50.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
    expect(result.debugRows[0].final_value).toBe("min_free_shipping: 50 USD");
    expect(result.debugRows[0].final_evidence_sentence).toContain("free");
  });

  it("does not turn public safety solution text into a confirmed first responder yes", () => {
    const result = runEval([
      {
        term_id: "2",
        country: "US",
        term_name: "LexisNexis",
        domain: "lexisnexis.com",
        subclass: "first responder",
        source_type: "aimode",
        snippet: "LexisNexis provides software for public safety teams and law enforcement agencies through government contracts.",
      },
      {
        term_id: "2",
        country: "US",
        term_name: "LexisNexis",
        domain: "lexisnexis.com",
        subclass: "first responder",
        source_type: "searchlab",
        snippet: "There is no fixed first responder discount for consumers.",
      },
    ]);

    expect(result.debugRows[0].final_supported).not.toBe("yes");
  });

  it("uses context to identify existing customer benefits", () => {
    const result = runEval([
      {
        term_id: "3",
        country: "US",
        term_name: "LovelySkin",
        domain: "lovelyskin.com",
        subclass: "existing customer",
        source_type: "aimode",
        snippet: "Existing customers receive an everyday discount based on membership tiers and annual spending.",
      },
      {
        term_id: "3",
        country: "US",
        term_name: "LovelySkin",
        domain: "lovelyskin.com",
        subclass: "existing customer",
        source_type: "searchlab",
        snippet: "Members receive rewards and repeat-customer benefits.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("extracts app-specific evidence instead of staying unknown", () => {
    const result = runEval([
      {
        term_id: "4",
        country: "US",
        term_name: "Big Bus Tours",
        domain: "bigbustours.com",
        subclass: "app",
        source_type: "aimode",
        snippet: "Big Bus Tours offers an app-exclusive 15% discount for first bookings in the official mobile app.",
      },
      {
        term_id: "4",
        country: "US",
        term_name: "Big Bus Tours",
        domain: "bigbustours.com",
        subclass: "app",
        source_type: "searchlab",
        snippet: "Download the official app to unlock exclusive offers.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
    expect(result.debugRows[0].final_evidence_sentence.toLowerCase()).toContain("app");
  });

  it("keeps unknown when both sides strongly conflict", () => {
    const result = runEval([
      {
        term_id: "5",
        country: "US",
        term_name: "Store X",
        domain: "storex.com",
        subclass: "shipping",
        source_type: "aimode",
        snippet: "Store X offers free shipping on all domestic orders.",
      },
      {
        term_id: "5",
        country: "US",
        term_name: "Store X",
        domain: "storex.com",
        subclass: "shipping",
        source_type: "searchlab",
        snippet: "Store X does not offer free shipping and charges a flat delivery fee.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("unknown");
    expect(result.debugRows[0].final_reason_cn).toContain("conflict");
  });
  it("uses the first two sentences to avoid later unrelated discount noise", () => {
    const result = runEval([
      {
        term_id: "6",
        country: "DE",
        term_name: "Leiste24",
        domain: "leiste24.de",
        subclass: "app",
        source_type: "searchlab",
        snippet:
          "Based on the available information, there is no evidence of a specific, permanent app-based discount for Leiste24. The company focuses on sales through its website and Amazon. Later in the page there are general promotions like 15% off during Black Week.",
      },
      {
        term_id: "6",
        country: "DE",
        term_name: "Leiste24",
        domain: "leiste24.de",
        subclass: "app",
        source_type: "aimode",
        snippet: "No app-exclusive discount is listed.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("does not mark generic discount text as app yes without an explicit app clue", () => {
    const result = runEval([
      {
        term_id: "7",
        country: "DE",
        term_name: "Lebenskompass",
        domain: "lebenskompass.eu",
        subclass: "app",
        source_type: "searchlab",
        snippet:
          "Ja, es gibt verschiedene Rabattmöglichkeiten bei Lebenskompass. Mit dem Code KOMPASS10 erhalten Kunden derzeit 10 % Rabatt auf ihre Bestellung. Zudem gibt es bis zu 50 % Rabatt im Sale-Bereich.",
      },
      {
        term_id: "7",
        country: "DE",
        term_name: "Lebenskompass",
        domain: "lebenskompass.eu",
        subclass: "app",
        source_type: "aimode",
        snippet:
          "Ja, es gibt verschiedene Rabattmöglichkeiten bei Lebenskompass. Mit dem Code KOMPASS10 erhalten Kunden derzeit 10 % Rabatt auf ihre Bestellung. Zudem gibt es bis zu 50 % Rabatt im Sale-Bereich.",
      },
    ]);

    expect(result.debugRows[0].final_supported).not.toBe("yes");
  });

  it("prefers an explicit no in the first two sentences over later generic employee benefit noise", () => {
    const result = runEval([
      {
        term_id: "7a",
        country: "US",
        term_name: "Lotro",
        domain: "lotro.com",
        subclass: "employee",
        source_type: "aimode",
        snippet:
          "没有公开证据表明 LOTRO 为员工提供专门的游戏内折扣。通常这类信息属于公司内部政策，不会对公众披露。 虽然员工的具体福利未公开，但玩家仍可获得商店折扣和免费内容代码。",
      },
      {
        term_id: "7a",
        country: "US",
        term_name: "Lotro",
        domain: "lotro.com",
        subclass: "employee",
        source_type: "searchlab",
        snippet:
          "No public information confirms a specific employee discount. General player promotions are available.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects employee yes from Chinese employee discount wording", () => {
    const result = runEval([
      {
        term_id: "8",
        country: "UK",
        term_name: "The Glass Warehouse",
        domain: "theglasswarehouse.co.uk",
        subclass: "employee",
        source_type: "aimode",
        snippet: "Glass Warehouse 的员工确实享有员工折扣，该折扣是其福利待遇的一部分。",
      },
      {
        term_id: "8",
        country: "UK",
        term_name: "The Glass Warehouse",
        domain: "theglasswarehouse.co.uk",
        subclass: "employee",
        source_type: "searchlab",
        snippet: "Employees have access to staff discount and other benefits.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps employee no when only swag and general benefits are mentioned", () => {
    const result = runEval([
      {
        term_id: "8a",
        country: "US",
        term_name: "Lola Blankets",
        domain: "lolablankets.com",
        subclass: "employee",
        source_type: "aimode",
        snippet:
          "Lola Blankets does not offer a formal employee discount. Employees may receive free products, swag, and general benefits.",
      },
      {
        term_id: "8a",
        country: "US",
        term_name: "Lola Blankets",
        domain: "lolablankets.com",
        subclass: "employee",
        source_type: "searchlab",
        snippet:
          "There is no verified mention of a dedicated purchase discount for internal employees.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps first responder no when the snippet says the merchant does not directly offer it", () => {
    const result = runEval([
      {
        term_id: "9",
        country: "US",
        term_name: "& Other Stories",
        domain: "stories.com",
        subclass: "first responder",
        source_type: "aimode",
        snippet: "& Other Stories does not directly offer a dedicated first responder discount on its official site, though third-party platforms may occasionally list key worker savings.",
      },
      {
        term_id: "9",
        country: "US",
        term_name: "& Other Stories",
        domain: "stories.com",
        subclass: "first responder",
        source_type: "searchlab",
        snippet: "No official first responder discount is listed for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("treats blue light card as no when the snippet says there is no confirmation", () => {
    const result = runEval([
      {
        term_id: "9a",
        country: "US",
        term_name: "LeeAngelos",
        domain: "leeangelos.com",
        subclass: "blue light card",
        source_type: "aimode",
        snippet:
          "Some similar UK businesses support Blue Light Card, but LeeAngelos is a US-based restaurant. Instead of Blue Light discounts, it offers general specials.",
      },
      {
        term_id: "9a",
        country: "US",
        term_name: "LeeAngelos",
        domain: "leeangelos.com",
        subclass: "blue light card",
        source_type: "searchlab",
        snippet:
          "There is no confirmation that LeeAngelos offers a Blue Light Card discount.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("treats family-size packs as no for family discount", () => {
    const result = runEval([
      {
        term_id: "9b",
        country: "US",
        term_name: "M&M'S",
        domain: "mms.com",
        subclass: "family",
        source_type: "aimode",
        snippet:
          "M&M'S does not offer a dedicated family discount. Customers can buy family-size packs instead of receiving a family discount.",
      },
      {
        term_id: "9b",
        country: "US",
        term_name: "M&M'S",
        domain: "mms.com",
        subclass: "family",
        source_type: "searchlab",
        snippet: "Family-size bags are available, rather than a dedicated family discount.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects gift card yes from purchase and terms language", () => {
    const result = runEval([
      {
        term_id: "9c",
        country: "UK",
        term_name: "Mindful Chef",
        domain: "mindfulchef.com",
        subclass: "gift card",
        source_type: "aimode",
        snippet:
          "Mindful Chef offers digital gift cards that can be sent directly to a recipient or to yourself to print out. No change or credit is given for unused portions of a gift card, and they cannot be exchanged for cash.",
      },
      {
        term_id: "9c",
        country: "UK",
        term_name: "Mindful Chef",
        domain: "mindfulchef.com",
        subclass: "gift card",
        source_type: "searchlab",
        snippet: "Gift cards are available for purchase on the gift cards page.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps family no for German no-special-family-discount wording", () => {
    const result = runEval([
      {
        term_id: "348a",
        country: "DE",
        term_name: "Lebenskraftpur",
        domain: "lebenskraftpur.de",
        subclass: "family",
        source_type: "aimode",
        snippet: "Nein, LEBENSKRAFTPUR bietet keine speziellen Familienrabatte an.",
      },
      {
        term_id: "348a",
        country: "DE",
        term_name: "Lebenskraftpur",
        domain: "lebenskraftpur.de",
        subclass: "family",
        source_type: "searchlab",
        snippet: "Keine speziellen Familienrabatte sind aufgeführt.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps gift card yes when the merchant lets users create and sell their own gift cards", () => {
    const result = runEval([
      {
        term_id: "348b",
        country: "UK",
        term_name: "ClassBento",
        domain: "classbento.co.uk",
        subclass: "gift card",
        source_type: "aimode",
        snippet:
          "ClassBento does not directly sell gift cards for its own services, but the platform provides tools for you to create and sell your own gift cards to your customers.",
      },
      {
        term_id: "348b",
        country: "UK",
        term_name: "ClassBento",
        domain: "classbento.co.uk",
        subclass: "gift card",
        source_type: "searchlab",
        snippet: "The platform provides tools to create and sell your own gift cards.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps app no when the app discount belongs to another retailer", () => {
    const result = runEval([
      {
        term_id: "9d",
        country: "DE",
        term_name: "Knirpsexperte",
        domain: "knirpsexperte.shop",
        subclass: "app",
        source_type: "aimode",
        snippet:
          "Die expert-App bietet exklusive Coupons und Rabatte. Fuer aktuelle Rabatte bei Knirpsexperte lohnt sich eher die Suche nach allgemeinen Gutscheincodes, waehrend sich die App-Rabatte auf den Haendler expert beziehen.",
      },
      {
        term_id: "9d",
        country: "DE",
        term_name: "Knirpsexperte",
        domain: "knirpsexperte.shop",
        subclass: "app",
        source_type: "searchlab",
        snippet: "The app discounts apply to the retailer rather than the brand itself.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps app as no when the snippet says there is no dedicated app discount", () => {
    const result = runEval([
      {
        term_id: "10",
        country: "DE",
        term_name: "Kidomio",
        domain: "kidomio.com",
        subclass: "app",
        source_type: "aimode",
        snippet:
          "Die Webseite bietet einen allgemeinen 10% Gutschein, jedoch wurde keine spezifische App mit einem exklusiven App-Rabatt erwähnt.",
      },
      {
        term_id: "10",
        country: "DE",
        term_name: "Kidomio",
        domain: "kidomio.com",
        subclass: "app",
        source_type: "searchlab",
        snippet: "No dedicated mobile app discount is listed.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps app as no when a merchant has a free app but explicitly says there are no app discounts", () => {
    const result = runEval([
      {
        term_id: "10a",
        country: "PL",
        term_name: "Arte",
        domain: "arte.pl",
        subclass: "app",
        source_type: "aimode",
        snippet:
          "Tak, ARTE posiada bezplatna aplikacje mobilna, ale nie oferuje typowych znizek w aplikacji i tresci sa dostepne za darmo.",
      },
      {
        term_id: "10a",
        country: "PL",
        term_name: "Arte",
        domain: "arte.pl",
        subclass: "app",
        source_type: "searchlab",
        snippet:
          "The mobile app is free to use, but there is no app-specific discount or app-only benefit.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps app as no when the snippet says no specific app discount was mentioned", () => {
    const result = runEval([
      {
        term_id: "10aa",
        country: "DE",
        term_name: "Kidomio",
        domain: "kidomio.com",
        subclass: "app",
        source_type: "aimode",
        snippet:
          "Die Webseite bietet einen allgemeinen 10% Gutschein, jedoch wurde keine spezifische App mit einem exklusiven App-Rabatt erwähnt.",
      },
      {
        term_id: "10aa",
        country: "DE",
        term_name: "Kidomio",
        domain: "kidomio.com",
        subclass: "app",
        source_type: "searchlab",
        snippet: "No dedicated app-exclusive discount is mentioned.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps app as no for Chinese wording that says the app does not have app-exclusive discounts", () => {
    const result = runEval([
      {
        term_id: "10ab",
        country: "US",
        term_name: "1-800-PetMeds",
        domain: "1800petmeds.com",
        subclass: "app",
        source_type: "aimode",
        snippet:
          "不会专门为下载其应用程序提供持续的折扣，目前的常规优惠并不是针对App 用户独享。",
      },
      {
        term_id: "10ab",
        country: "US",
        term_name: "1-800-PetMeds",
        domain: "1800petmeds.com",
        subclass: "app",
        source_type: "searchlab",
        snippet: "There is no app-exclusive discount; the same promotions work on app and web.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects employee yes from explicit staff discount wording", () => {
    const result = runEval([
      {
        term_id: "11",
        country: "US",
        term_name: "Muscle & Strength",
        domain: "muscleandstrength.com",
        subclass: "employee",
        source_type: "aimode",
        snippet: "Career Opportunities. Excellent employee discounts on all products sold in the online store.",
      },
      {
        term_id: "11",
        country: "US",
        term_name: "Muscle & Strength",
        domain: "muscleandstrength.com",
        subclass: "employee",
        source_type: "searchlab",
        snippet: "Employees receive staff discount and other benefits.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps child as no when only adult-only restrictions are mentioned", () => {
    const result = runEval([
      {
        term_id: "12",
        country: "US",
        term_name: "1 Stop Vapor",
        domain: "1stopvapor.com",
        subclass: "child",
        source_type: "aimode",
        snippet:
          "1 Stop Vapor does not offer a kids discount because its products are intended only for adults of legal smoking age.",
      },
      {
        term_id: "12",
        country: "US",
        term_name: "1 Stop Vapor",
        domain: "1stopvapor.com",
        subclass: "child",
        source_type: "searchlab",
        snippet: "Products are strictly intended for adults and not for children.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps child as no when German text only mentions no special child discounts", () => {
    const result = runEval([
      {
        term_id: "12a",
        country: "DE",
        term_name: "MADLADY",
        domain: "madlady.com",
        subclass: "child",
        source_type: "aimode",
        snippet: "Es gibt auf der offiziellen Website keine Hinweise auf spezielle Kinderrabatte.",
      },
      {
        term_id: "12a",
        country: "DE",
        term_name: "MADLADY",
        domain: "madlady.com",
        subclass: "child",
        source_type: "searchlab",
        snippet: "No child-specific discount is listed.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects child yes from German hotel child discount wording", () => {
    const result = runEval([
      {
        term_id: "12b",
        country: "DE",
        term_name: "Kempinski",
        domain: "kempinski.com",
        subclass: "child",
        source_type: "aimode",
        snippet: "Viele Hotels bieten Kinderermäßigungen, und Kinder übernachten oft kostenlos oder vergünstigt in Begleitung von Erwachsenen.",
      },
      {
        term_id: "12b",
        country: "DE",
        term_name: "Kempinski",
        domain: "kempinski.com",
        subclass: "child",
        source_type: "searchlab",
        snippet: "Children may stay free and child discounts vary by hotel.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps child as no for Korean wording that says no dedicated child discount exists", () => {
    const result = runEval([
      {
        term_id: "12c",
        country: "KR",
        term_name: "Direct Games",
        domain: "directgames.co.kr",
        subclass: "child",
        source_type: "aimode",
        snippet: "어린이 전용 할인 혜택을 별도로 운영하지 않습니다.",
      },
      {
        term_id: "12c",
        country: "KR",
        term_name: "Direct Games",
        domain: "directgames.co.kr",
        subclass: "child",
        source_type: "searchlab",
        snippet: "No child-specific discount is offered.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps child as unknown when the merchant entity is unclear", () => {
    const result = runEval([
      {
        term_id: "12d",
        country: "UK",
        term_name: "262",
        domain: "262clo.com",
        subclass: "child",
        source_type: "aimode",
        snippet:
          'It is unclear what "262" refers to in your question, as it could be a flight number, a bus route, or a specific product. Please specify if you are asking about a specific airline, bus route, or company.',
      },
      {
        term_id: "12d",
        country: "UK",
        term_name: "262",
        domain: "262clo.com",
        subclass: "child",
        source_type: "searchlab",
        snippet: 'It is unclear what "262" refers to, so a child discount cannot be confirmed.',
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("unknown");
  });

  it("keeps child as no when only kids club or kids category language is mentioned", () => {
    const result = runEval([
      {
        term_id: "12e",
        country: "DE",
        term_name: "Fanshop",
        domain: "fanshop.de",
        subclass: "child",
        source_type: "aimode",
        snippet:
          "Ja, the shop offers a Pänzclub for children and a Kinder sale category, but the 10% discount is only a general member discount rather than a child-specific discount.",
      },
      {
        term_id: "12e",
        country: "DE",
        term_name: "Fanshop",
        domain: "fanshop.de",
        subclass: "child",
        source_type: "searchlab",
        snippet: "There is a kids section and sale category, but no dedicated child discount is listed.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps child as no when Chinese text says there is no permanent child discount and only promo pricing on kids items", () => {
    const result = runEval([
      {
        term_id: "12f1",
        country: "US",
        term_name: "Masseys",
        domain: "masseys.example",
        subclass: "child",
        source_type: "aimode",
        snippet:
          "Masseys does not directly offer a permanent child discount, but it often promotes kids shoes and toys through general promo codes and clearance sales.",
      },
      {
        term_id: "12f1",
        country: "US",
        term_name: "Masseys",
        domain: "masseys.example",
        subclass: "child",
        source_type: "searchlab",
        snippet: "There is no dedicated child discount, only general promotions on kids items.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects child yes from German cinema U21 ticket wording", () => {
    const result = runEval([
      {
        term_id: "12f2",
        country: "DE",
        term_name: "kinoheld",
        domain: "kinoheld.example",
        subclass: "child",
        source_type: "aimode",
        snippet:
          "Kinder und Jugendliche unter 21 Jahren erhalten beispielsweise ein U21-Ticket fuer 7,50 EUR; viele Kinos bieten Kinderpreise oder Familientarife.",
      },
      {
        term_id: "12f2",
        country: "DE",
        term_name: "kinoheld",
        domain: "kinoheld.example",
        subclass: "child",
        source_type: "searchlab",
        snippet: "U21 tickets and child prices are available depending on the cinema.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps child no when German text says there is no specific child discount", () => {
    const result = runEval([
      {
        term_id: "12f3",
        country: "DE",
        term_name: "Llama Leisure",
        domain: "llama-leisure.example",
        subclass: "child",
        source_type: "searchlab",
        snippet:
          "Der Shop bietet keinen speziellen Kinderrabatt; Kinderartikel sind nur regulär günstiger als Erwachsenenprodukte.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps child no when the lead sentence denies a child discount and later text only lists general savings", () => {
    const result = runEval([
      {
        term_id: "12f4",
        country: "UK",
        term_name: "Llama Leisure",
        domain: "llamaleisure.example",
        subclass: "child",
        source_type: "searchlab",
        snippet:
          "Llama Leisure does not provide a child-specific discount. Kids items are cheaper than adult items, and newsletter or bundle savings may still apply storewide.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps shipping as unknown when free delivery belongs to a different entity", () => {
    const result = runEval([
      {
        term_id: "12f",
        country: "UK",
        term_name: "Luxury Coastal",
        domain: "luxurycoastal.co.uk",
        subclass: "shipping",
        source_type: "aimode",
        snippet:
          "Luxury Coastal mainly handles holiday rental bookings. A different entity, Luxury Coastal Vacations, provides free delivery for linen sets at certain properties.",
      },
      {
        term_id: "12f",
        country: "UK",
        term_name: "Luxury Coastal",
        domain: "luxurycoastal.co.uk",
        subclass: "shipping",
        source_type: "searchlab",
        snippet: "If you are referring to a similarly named company, free delivery may apply there instead.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("unknown");
  });

  it("keeps shipping no when only occasional promotion-based free delivery is mentioned", () => {
    const result = runEval([
      {
        term_id: "ship-no-promo",
        country: "UK",
        term_name: "Store Promo",
        domain: "storepromo.co.uk",
        subclass: "shipping",
        source_type: "aimode",
        snippet:
          "Store Promo does not currently offer free delivery as a standard policy. Occasional free shipping promotions may appear during campaigns.",
      },
      {
        term_id: "ship-no-promo",
        country: "UK",
        term_name: "Store Promo",
        domain: "storepromo.co.uk",
        subclass: "shipping",
        source_type: "searchlab",
        snippet: "No regular free shipping is listed for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps teacher as unknown when the snippet only points to third-party educator platforms", () => {
    const result = runEval([
      {
        term_id: "12g",
        country: "UK",
        term_name: "& Other Stories",
        domain: "stories.com",
        subclass: "teacher",
        source_type: "aimode",
        snippet:
          "There is no official direct teacher discount, but Discounts for Teachers may sometimes list a 10% offer through a third-party educator platform.",
      },
      {
        term_id: "12g",
        country: "UK",
        term_name: "& Other Stories",
        domain: "stories.com",
        subclass: "teacher",
        source_type: "searchlab",
        snippet: "You may need to verify through GoCertify or another partner platform.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("unknown");
  });

  it("detects teacher no from German no-specific-teacher-discount wording", () => {
    const result = runEval([
      {
        term_id: "12h",
        country: "DE",
        term_name: "Liebeart",
        domain: "liebeart.de",
        subclass: "teacher",
        source_type: "aimode",
        snippet:
          "Basierend auf den verfügbaren Informationen gibt es keinen spezifischen, öffentlich ausgewiesenen Lehrerrabatt.",
      },
      {
        term_id: "12h",
        country: "DE",
        term_name: "Liebeart",
        domain: "liebeart.de",
        subclass: "teacher",
        source_type: "searchlab",
        snippet: "Die Website bietet keine speziellen Rabattprogramme für Bildungspersonal an.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps teacher as yes when the merchant explicitly offers it through a verified partner flow", () => {
    const result = runEval([
      {
        term_id: "12i",
        country: "UK",
        term_name: "mahabis",
        domain: "mahabis.com",
        subclass: "teacher",
        source_type: "aimode",
        snippet:
          "mahabis does offer a teacher discount, typically through Discounts for Teachers where verified educators can receive 20% off full-price items.",
      },
      {
        term_id: "12i",
        country: "UK",
        term_name: "mahabis",
        domain: "mahabis.com",
        subclass: "teacher",
        source_type: "searchlab",
        snippet: "Verified educators can access the offer through a partner verification platform.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps teacher as no when the snippet only recommends other brands with teacher discounts", () => {
    const result = runEval([
      {
        term_id: "12j",
        country: "US",
        term_name: "Lox & Chain",
        domain: "loxandchain.com",
        subclass: "teacher",
        source_type: "aimode",
        snippet:
          "Lox & Chain does not currently offer a specific discount for teachers or educators. If you are looking for jewelry with a teacher discount, other brands have confirmed programs.",
      },
      {
        term_id: "12j",
        country: "US",
        term_name: "Lox & Chain",
        domain: "loxandchain.com",
        subclass: "teacher",
        source_type: "searchlab",
        snippet: "Alternative jewelry brands with teacher discounts are listed, but not this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects birthday yes from birthday rewards points wording", () => {
    const result = runEval([
      {
        term_id: "13",
        country: "US",
        term_name: "AC Infinity",
        domain: "acinfinity.com",
        subclass: "birthday",
        source_type: "aimode",
        snippet: "Members can collect points for their birthday in the rewards program.",
      },
      {
        term_id: "13",
        country: "US",
        term_name: "AC Infinity",
        domain: "acinfinity.com",
        subclass: "birthday",
        source_type: "searchlab",
        snippet: "Birthday rewards are available after you add your birth date.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps birthday as no when the snippet only mentions birthday gifts sold by the merchant", () => {
    const result = runEval([
      {
        term_id: "13a",
        country: "DE",
        term_name: "Laserliebe",
        domain: "laserliebe.de",
        subclass: "birthday",
        source_type: "aimode",
        snippet:
          "Laserliebe bietet personalisierte Geschenke fuer Geburtstage an, aber es gibt keine explizite Information ueber einen speziellen Geburtstagsrabatt.",
      },
      {
        term_id: "13a",
        country: "DE",
        term_name: "Laserliebe",
        domain: "laserliebe.de",
        subclass: "birthday",
        source_type: "searchlab",
        snippet: "No dedicated birthday discount is listed.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects birthday yes from German birthday offer wording", () => {
    const result = runEval([
      {
        term_id: "13b",
        country: "DE",
        term_name: "Mauritius Bowling",
        domain: "mauritius-bowling.de",
        subclass: "birthday",
        source_type: "aimode",
        snippet:
          "Es gibt ein Geburtstagsangebot: Bei einer Online-Buchung in der Geburtstagswoche erhalten Gruppen ab sechs Personen eine Flasche Prosecco gratis.",
      },
      {
        term_id: "13b",
        country: "DE",
        term_name: "Mauritius Bowling",
        domain: "mauritius-bowling.de",
        subclass: "birthday",
        source_type: "searchlab",
        snippet: "Birthday week bookings get a free bottle of Prosecco.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps birthday no when the merchant only offers a prize draw instead of a birthday discount", () => {
    const result = runEval([
      {
        term_id: "13b1",
        country: "UK",
        term_name: "LimbO Products",
        domain: "limbo.example",
        subclass: "birthday",
        source_type: "aimode",
        snippet:
          "LimbO Products does not currently offer a specific birthday discount. Instead of a direct birthday coupon, the company provides a prize draw opportunity through product registration.",
      },
      {
        term_id: "13b1",
        country: "UK",
        term_name: "LimbO Products",
        domain: "limbo.example",
        subclass: "birthday",
        source_type: "searchlab",
        snippet: "There is no birthday discount, only a registration prize draw.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps birthday no when Polish text says there is no standard birthday discount", () => {
    const result = runEval([
      {
        term_id: "13b3",
        country: "PL",
        term_name: "LUSH",
        domain: "lush.example",
        subclass: "birthday",
        source_type: "searchlab",
        snippet:
          "LUSH nie oferuje standardowej, publicznie ogłaszanej zniżki urodzinowej dla klientów.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps birthday no when the snippet denies a standard birthday discount and only mentions loyalty perks or gift sets", () => {
    const result = runEval([
      {
        term_id: "13b4",
        country: "PL",
        term_name: "LUSH",
        domain: "lush.example",
        subclass: "birthday",
        source_type: "searchlab",
        snippet:
          "LUSH nie oferuje standardowej, powszechnie ogłaszanej zniżki urodzinowej dla klientów. Zamiast tego wspomina o benefitach programu lojalnościowego i gotowych zestawach prezentowych.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects birthday yes when members receive a birthday bonus in points", () => {
    const result = runEval([
      {
        term_id: "13b2",
        country: "UK",
        term_name: "Jadlam",
        domain: "jadlam.example",
        subclass: "birthday",
        source_type: "aimode",
        snippet:
          "Members receive a 100 J-Point bonus on their birthday in the Jadlam Rewards program, even though there is no direct percentage-off coupon.",
      },
      {
        term_id: "13b2",
        country: "UK",
        term_name: "Jadlam",
        domain: "jadlam.example",
        subclass: "birthday",
        source_type: "searchlab",
        snippet: "A 100 J-Point birthday bonus is granted to loyalty members.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("detects first responder yes for Karta Mundurowa style evidence", () => {
    const result = runEval([
      {
        term_id: "10",
        country: "PL",
        term_name: "Militaria",
        domain: "militaria.pl",
        subclass: "first responder",
        source_type: "aimode",
        snippet: "Militaria.pl oferuje zniżki dla służb mundurowych i ratunkowych, w tym straży pożarnej i ratownictwa medycznego, we współpracy z programem Karta Mundurowa.",
      },
      {
        term_id: "10",
        country: "PL",
        term_name: "Militaria",
        domain: "militaria.pl",
        subclass: "first responder",
        source_type: "searchlab",
        snippet: "Posiadacze zweryfikowanego konta Karta Mundurowa otrzymują 6% stałego rabatu na zakupy.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps first responder as no when the first sentence says there is no confirmed responder discount and later mentions other merchants", () => {
    const result = runEval([
      {
        term_id: "10b",
        country: "PL",
        term_name: "Ubra",
        domain: "ubra.pl",
        subclass: "first responder",
        source_type: "aimode",
        snippet:
          "Brak jest danych potwierdzających, że Ubra oferuje specjalną zniżkę dla służb ratunkowych. Inne sklepy, takie jak Militaria, mogą mieć takie oferty.",
      },
      {
        term_id: "10b",
        country: "PL",
        term_name: "Ubra",
        domain: "ubra.pl",
        subclass: "first responder",
        source_type: "searchlab",
        snippet:
          "No confirmed first responder discount is listed for Ubra; later references are about other brands and Karta Mundurowa examples.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps first responder as no when statutory service discounts only apply on duty", () => {
    const result = runEval([
      {
        term_id: "10c",
        country: "PL",
        term_name: "Koleo",
        domain: "koleo.pl",
        subclass: "first responder",
        source_type: "aimode",
        snippet:
          "KOLEO umożliwia zakup biletów z ustawowymi zniżkami dla służb mundurowych tylko w czasie wykonywania czynności służbowych. Nie oferuje zniżek dedykowanych prywatnie dla pracowników służb ratunkowych.",
      },
      {
        term_id: "10c",
        country: "PL",
        term_name: "Koleo",
        domain: "koleo.pl",
        subclass: "first responder",
        source_type: "searchlab",
        snippet:
          "The only discounts are statutory on-duty fares rather than a consumer first responder discount program.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps first responder as no when Spanish text says no emergency-services-specific discount is confirmed", () => {
    const result = runEval([
      {
        term_id: "10d",
        country: "ES",
        term_name: "Scientiffic Nutrition",
        domain: "scientifficnutrition.com",
        subclass: "first responder",
        source_type: "aimode",
        snippet:
          "Basado en la información disponible, no se confirma que Scientiffic Nutrition ofrezca un descuento específico para el personal de emergencia.",
      },
      {
        term_id: "10d",
        country: "ES",
        term_name: "Scientiffic Nutrition",
        domain: "scientifficnutrition.com",
        subclass: "first responder",
        source_type: "searchlab",
        snippet: "No dedicated first responder discount is confirmed for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps first responder no when Chinese text says no dedicated responder plan exists and only sitewide discounts apply", () => {
    const result = runEval([
      {
        term_id: "10e",
        country: "UK",
        term_name: "Lovely Flora World",
        domain: "lovelyflora.example",
        subclass: "first responder",
        source_type: "aimode",
        snippet:
          "Lovely Flora World does not provide a dedicated first responder discount plan, though the site runs general sitewide sales and automatic discounts.",
      },
      {
        term_id: "10e",
        country: "UK",
        term_name: "Lovely Flora World",
        domain: "lovelyflora.example",
        subclass: "first responder",
        source_type: "searchlab",
        snippet: "No dedicated first responder discount exists; only general sitewide sales apply.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps first responder no when the brand itself lacks the discount and only third-party retailers may have one", () => {
    const result = runEval([
      {
        term_id: "10f",
        country: "US",
        term_name: "Makeup Eraser",
        domain: "makeuperaser.example",
        subclass: "first responder",
        source_type: "aimode",
        snippet:
          "While the brand itself does not have a first responder discount, some third-party retailers may apply one to products they carry.",
      },
      {
        term_id: "10f",
        country: "US",
        term_name: "Makeup Eraser",
        domain: "makeuperaser.example",
        subclass: "first responder",
        source_type: "searchlab",
        snippet: "The merchant itself has no standing first responder discount.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps first responder no when German text says there are no signs of responder discounts", () => {
    const result = runEval([
      {
        term_id: "10f1",
        country: "DE",
        term_name: "Mister Spex",
        domain: "misterspex.example",
        subclass: "first responder",
        source_type: "searchlab",
        snippet:
          "Es gibt keine Anzeichen für spezielle Rabatte oder Ermäßigungen für Ersthelfer.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps first responder no when the merchant lacks the discount and a later sentence mentions another brand", () => {
    const result = runEval([
      {
        term_id: "10f2",
        country: "UK",
        term_name: "Lomo",
        domain: "lomo.example",
        subclass: "first responder",
        source_type: "searchlab",
        snippet:
          "Lomo does not clearly list any long-term first responder discount. A different brand, Lumos, may offer one, but that does not apply to Lomo Watersport itself.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps military no when only third-party vendors offer the discount", () => {
    const result = runEval([
      {
        term_id: "11",
        country: "US",
        term_name: "LightBurn Software",
        domain: "lightburnsoftware.com",
        subclass: "military",
        source_type: "aimode",
        snippet: "LightBurn Software does not offer an official military discount directly through their website.",
      },
      {
        term_id: "11",
        country: "US",
        term_name: "LightBurn Software",
        domain: "lightburnsoftware.com",
        subclass: "military",
        source_type: "searchlab",
        snippet: "You may find indirect savings through third-party laser hardware vendors, but LightBurn itself does not provide a specific military code.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps military no when Chinese text says there is no regular military discount and only third-party restaurant offers exist", () => {
    const result = runEval([
      {
        term_id: "11a",
        country: "US",
        term_name: "Lunch-Drop",
        domain: "lunchdrop.example",
        subclass: "military",
        source_type: "aimode",
        snippet:
          "According to public information, the platform does not mention a regular military discount for individuals, though some restaurants ordered through it may have their own military offers.",
      },
      {
        term_id: "11a",
        country: "US",
        term_name: "Lunch-Drop",
        domain: "lunchdrop.example",
        subclass: "military",
        source_type: "searchlab",
        snippet: "No regular military discount is offered by the platform itself.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps military no when the snippet says there is currently no dedicated military program", () => {
    const result = runEval([
      {
        term_id: "11a1",
        country: "US",
        term_name: "Magellan's",
        domain: "magellans.example",
        subclass: "military",
        source_type: "searchlab",
        snippet:
          "Magellan's does not currently offer a dedicated military discount or promotional program.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps military no when the first sentence says there is no year-round military discount", () => {
    const result = runEval([
      {
        term_id: "11a1b",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "military",
        source_type: "aimode",
        snippet: "Socktopus has no specific year-round military discount. Customers may still save through newsletters or seasonal promotions.",
      },
      {
        term_id: "11a1b",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "military",
        source_type: "searchlab",
        snippet: "No standing military discount is listed for the merchant itself.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps military no when the lead sentence denies a military program and later text only lists general savings", () => {
    const result = runEval([
      {
        term_id: "11a2",
        country: "US",
        term_name: "Magellan's",
        domain: "magellans.example",
        subclass: "military",
        source_type: "searchlab",
        snippet:
          "Magellan's does not currently offer a dedicated military discount or promotional program. Customers can still save through newsletter discounts, outlet items, and seasonal catalog offers.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("preserves angle-bracketed business text in snippets instead of treating it as html", () => {
    const result = runEval([
      {
        term_id: "11a3",
        country: "UK",
        term_name: "Inwild",
        domain: "inwild.co.uk",
        subclass: "military",
        source_type: "aimode",
        snippet:
          "Inwild does not offer a standing military discount, but verified members can sometimes receive up to <10%> off through <ID.me> or similar partner verification flows.",
      },
    ]);

    expect(result.debugRows[0].final_snippet).toContain("<10%>");
    expect(result.debugRows[0].final_snippet).toContain("<ID.me>");
    expect(result.debugRows[0].aimode_snippet).toContain("<10%>");
  });

  it("keeps military unknown when the snippet talks about other military shops rather than the merchant", () => {
    const result = runEval([
      {
        term_id: "11b",
        country: "DE",
        term_name: "Letzteshemd",
        domain: "letzteshemd.example",
        subclass: "military",
        source_type: "aimode",
        snippet:
          "Basierend auf den Suchergebnissen gibt es keine spezifischen Informationen ueber einen Militaerrabatt bei Letzteshemd. Die meisten Online-Shops fuer Militaer- und Bundeswehrbedarf bieten jedoch allgemeine Sale-Bereiche an.",
      },
      {
        term_id: "11b",
        country: "DE",
        term_name: "Letzteshemd",
        domain: "letzteshemd.example",
        subclass: "military",
        source_type: "searchlab",
        snippet: "The text mostly discusses other military retailers rather than this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("unknown");
  });

  it("keeps birthday no when the snippet says the merchant does not offer a recurring birthday discount", () => {
    const result = runEval([
      {
        term_id: "12",
        country: "UK",
        term_name: "Majestic Wine",
        domain: "majestic.co.uk",
        subclass: "birthday",
        source_type: "aimode",
        snippet: "Majestic Wine does not currently offer a standard, recurring birthday discount for customers.",
      },
      {
        term_id: "12",
        country: "UK",
        term_name: "Majestic Wine",
        domain: "majestic.co.uk",
        subclass: "birthday",
        source_type: "searchlab",
        snippet: "Their 45th Birthday Sale is a store anniversary event, not a customer birthday benefit.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps birthday no for Korean text saying there is no fixed birthday coupon", () => {
    const result = runEval([
      {
        term_id: "13c",
        country: "KR",
        term_name: "29CM",
        domain: "29cm.co.kr",
        subclass: "birthday",
        source_type: "aimode",
        snippet: "29CM는 공식적으로 고정된 생일 할인 쿠폰 혜택을 제공하지 않습니다.",
      },
      {
        term_id: "13c",
        country: "KR",
        term_name: "29CM",
        domain: "29cm.co.kr",
        subclass: "birthday",
        source_type: "searchlab",
        snippet: "No standard birthday coupon is offered.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps price guarantee as no when German text says no explicit best price guarantee exists", () => {
    const result = runEval([
      {
        term_id: "13d",
        country: "DE",
        term_name: "123Lack",
        domain: "123lack.de",
        subclass: "price guarantee",
        source_type: "aimode",
        snippet: "Es gibt keine explizite Bestpreisgarantie oder spezielle Preisgarantie, und sie wird nicht aktiv beworben.",
      },
      {
        term_id: "13d",
        country: "DE",
        term_name: "123Lack",
        domain: "123lack.de",
        subclass: "price guarantee",
        source_type: "searchlab",
        snippet: "No price guarantee is listed.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects price guarantee yes from German best price guarantee wording", () => {
    const result = runEval([
      {
        term_id: "13e",
        country: "DE",
        term_name: "accipo",
        domain: "accipo.de",
        subclass: "price guarantee",
        source_type: "aimode",
        snippet:
          "Accipo bietet eine Bestpreis-Garantie. Wenn Sie ein guenstigeres Angebot finden, wird der Preis angeglichen oder die Differenz erstattet.",
      },
      {
        term_id: "13e",
        country: "DE",
        term_name: "accipo",
        domain: "accipo.de",
        subclass: "price guarantee",
        source_type: "searchlab",
        snippet: "The merchant matches the lower price or refunds the difference.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("treats typo subclass price guanrantee the same as price guarantee", () => {
    const result = runEval([
      {
        term_id: "13e-typo",
        country: "UK",
        term_name: "Polanight",
        domain: "polanight.com",
        subclass: "price guanrantee",
        source_type: "aimode",
        snippet: "There is no official price guarantee or price-match policy listed on the merchant website.",
      },
      {
        term_id: "13e-typo",
        country: "UK",
        term_name: "Polanight",
        domain: "polanight.com",
        subclass: "price guanrantee",
        source_type: "searchlab",
        snippet: "No public price guarantee is listed for this merchant.",
      },
    ]);

    expect(result.debugRows[0].fact_type).toBe("price guarantee");
    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps price guarantee no when the merchant lacks it and another company is the one with the guarantee", () => {
    const result = runEval([
      {
        term_id: "13e-cross-entity",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "price guarantee",
        source_type: "aimode",
        snippet:
          "Socktopus does not provide a price guarantee or price-match promise. Octopus Energy or partner retailers may mention price promises in separate contexts, but those do not apply to this merchant.",
      },
      {
        term_id: "13e-cross-entity",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "price guarantee",
        source_type: "searchlab",
        snippet: "No public price guarantee is listed for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("downgrades price guarantee to unknown when only third-party retailers mention price promises", () => {
    const result = runEval([
      {
        term_id: "13e-cross-entity-unknown",
        country: "UK",
        term_name: "Polanight Online Store",
        domain: "polanight.co.uk",
        subclass: "price guarantee",
        source_type: "aimode",
        snippet:
          "The official Polanight store does not clearly list a price guarantee policy. Some authorized retailers and third-party dental sellers may mention lowest-price guarantees for their own stores.",
      },
      {
        term_id: "13e-cross-entity-unknown",
        country: "UK",
        term_name: "Polanight Online Store",
        domain: "polanight.co.uk",
        subclass: "price guarantee",
        source_type: "searchlab",
        snippet: "No official price guarantee is confirmed for the merchant itself.",
      },
    ]);

    expect(result.debugRows[0].final_supported).not.toBe("yes");
  });

  it("keeps price guarantee no when the lead sentence clearly denies the merchant policy and later third-party retailers mention guarantees", () => {
    const result = runEval([
      {
        term_id: "13e-lead-no",
        country: "UK",
        term_name: "Polanight Online Store",
        domain: "polanight.co.uk",
        subclass: "price guarantee",
        source_type: "aimode",
        snippet:
          "The official Polanight store does not clearly list a price guarantee or price-match policy. Some authorized retailers and third-party dental sellers may mention lowest-price guarantees for their own stores.",
      },
      {
        term_id: "13e-lead-no",
        country: "UK",
        term_name: "Polanight Online Store",
        domain: "polanight.co.uk",
        subclass: "price guarantee",
        source_type: "searchlab",
        snippet: "No official price guarantee is confirmed for the merchant itself.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps family no when the text is only about friends and family sale events", () => {
    const result = runEval([
      {
        term_id: "13",
        country: "US",
        term_name: "Lord and Taylor",
        domain: "lordandtaylor.com",
        subclass: "family",
        source_type: "aimode",
        snippet: "Lord & Taylor does not offer a standard family discount, but it runs periodic Friends and Family Sale events.",
      },
      {
        term_id: "13",
        country: "US",
        term_name: "Lord and Taylor",
        domain: "lordandtaylor.com",
        subclass: "family",
        source_type: "searchlab",
        snippet: "Friends and Family promotions are temporary sales rather than a dedicated family discount.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps family no when the text is only about multibuy deals for families", () => {
    const result = runEval([
      {
        term_id: "13-family-bulk",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "family",
        source_type: "aimode",
        snippet: "Customers can save with 3 for GBP 20 multibuy bundle deals that are good for families, but there is no dedicated family discount.",
      },
      {
        term_id: "13-family-bulk",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "family",
        source_type: "searchlab",
        snippet: "The offer is a multibuy bundle rather than a specific family discount.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps newsletter no when savings only come from referral invites rather than sign-up", () => {
    const result = runEval([
      {
        term_id: "14",
        country: "US",
        term_name: "Loco Scooters",
        domain: "locoscooters.ie",
        subclass: "newsletter/first order/sign up/",
        source_type: "aimode",
        snippet: "LOCO Scooters offers a 15 EUR discount on first-time orders through their referral program when invited by a friend.",
      },
      {
        term_id: "14",
        country: "US",
        term_name: "Loco Scooters",
        domain: "locoscooters.ie",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "This is a referral reward, not a standard newsletter or sign-up discount.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects newsletter yes for explicit welcome discount on first registration", () => {
    const result = runEval([
      {
        term_id: "15",
        country: "ES",
        term_name: "Oviala",
        domain: "oviala.com",
        subclass: "newsletter/first order/sign up/",
        source_type: "aimode",
        snippet: "Oviala ofrece un descuento de bienvenida de 20 EUR para el primer pedido al registrarse por primera vez.",
      },
      {
        term_id: "15",
        country: "ES",
        term_name: "Oviala",
        domain: "oviala.com",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "El cupon de bienvenida es valido para la primera compra despues del registro.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps first responder no when the only mention is a third-party platform benefit", () => {
    const result = runEval([
      {
        term_id: "16",
        country: "UK",
        term_name: "& Other Stories",
        domain: "stories.com",
        subclass: "first responder",
        source_type: "aimode",
        snippet: "& Other Stories does not directly provide a first responder discount, though third-party platforms like Health Service Discounts may occasionally list regional offers.",
      },
      {
        term_id: "16",
        country: "UK",
        term_name: "& Other Stories",
        domain: "stories.com",
        subclass: "first responder",
        source_type: "searchlab",
        snippet: "It is not on the regular first responder discount list and relies on third-party platform codes.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps military no when the merchant only mentions Blue Light or third-party partner savings", () => {
    const result = runEval([
      {
        term_id: "17",
        country: "UK",
        term_name: "LoveCrafts",
        domain: "lovecrafts.com",
        subclass: "military",
        source_type: "aimode",
        snippet: "LoveCrafts does not offer a dedicated military discount, though armed services members may receive savings through its Blue Light Card partner plan.",
      },
      {
        term_id: "17",
        country: "UK",
        term_name: "LoveCrafts",
        domain: "lovecrafts.com",
        subclass: "military",
        source_type: "searchlab",
        snippet: "There is no independent military verification system for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps employee no when the snippet only says no public evidence and points to HR", () => {
    const result = runEval([
      {
        term_id: "18",
        country: "UK",
        term_name: "Malpas Farm Shop",
        domain: "malpasfarmshop.co.uk",
        subclass: "employee",
        source_type: "aimode",
        snippet:
          "There is no publicly available evidence confirming a standard employee discount. Staff benefits would usually be covered in the employment contract or staff handbook.",
      },
      {
        term_id: "18",
        country: "UK",
        term_name: "Malpas Farm Shop",
        domain: "malpasfarmshop.co.uk",
        subclass: "employee",
        source_type: "searchlab",
        snippet: "No public information confirms employee discounts for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects loyalty yes for paid membership with ongoing member benefits", () => {
    const result = runEval([
      {
        term_id: "19",
        country: "DE",
        term_name: "FC Shop",
        domain: "fcshop.de",
        subclass: "loyalty program",
        source_type: "aimode",
        snippet:
          "Members receive a 10% discount, a club card, welcome premium, and ongoing member-only benefits through the annual membership.",
      },
      {
        term_id: "19",
        country: "DE",
        term_name: "FC Shop",
        domain: "fcshop.de",
        subclass: "loyalty program",
        source_type: "searchlab",
        snippet: "The membership includes member discounts and priority access throughout the year.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps loyalty no when the snippet says social media promo codes are not a real loyalty program", () => {
    const result = runEval([
      {
        term_id: "20",
        country: "DE",
        term_name: "LowCarbBenni",
        domain: "lowcarbbenni.de",
        subclass: "loyalty program",
        source_type: "aimode",
        snippet:
          "The savings come mainly from Facebook promo codes and campaign discounts rather than a real loyalty program.",
      },
      {
        term_id: "20",
        country: "DE",
        term_name: "LowCarbBenni",
        domain: "lowcarbbenni.de",
        subclass: "loyalty program",
        source_type: "searchlab",
        snippet: "These are promotional discount codes on social media, not a classic loyalty program.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps loyalty no when the snippet says there is no confirmed loyalty program and only action-based rewards", () => {
    const result = runEval([
      {
        term_id: "20a",
        country: "ES",
        term_name: "MP Racing",
        domain: "mpracing.es",
        subclass: "loyalty program",
        source_type: "aimode",
        snippet:
          "No se menciona un programa de puntos tradicional, sino una recompensa vinculada a acciones específicas.",
      },
      {
        term_id: "20a",
        country: "ES",
        term_name: "MP Racing",
        domain: "mpracing.es",
        subclass: "loyalty program",
        source_type: "searchlab",
        snippet: "Rewards are tied to event participation rather than a real loyalty program.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps senior no for senior bundles aimed at older pets rather than human customers", () => {
    const result = runEval([
      {
        term_id: "21",
        country: "DE",
        term_name: "HorseFlex",
        domain: "horseflex.de",
        subclass: "senior",
        source_type: "aimode",
        snippet: "HorseFlex sells Senior Combi Deals for older horses and dogs, which are product bundles rather than a senior discount for customers.",
      },
      {
        term_id: "21",
        country: "DE",
        term_name: "HorseFlex",
        domain: "horseflex.de",
        subclass: "senior",
        source_type: "searchlab",
        snippet: "The word senior refers to animal products, and there is no senior discount for human customers.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps senior no when the first sentence says there is no specific senior rate", () => {
    const result = runEval([
      {
        term_id: "22",
        country: "US",
        term_name: "Las Vegas Monorail",
        domain: "lvmonorail.com",
        subclass: "senior",
        source_type: "aimode",
        snippet: "Las Vegas Monorail does not offer a specific senior discount. Online tickets may still be cheaper than kiosk prices.",
      },
      {
        term_id: "22",
        country: "US",
        term_name: "Las Vegas Monorail",
        domain: "lvmonorail.com",
        subclass: "senior",
        source_type: "searchlab",
        snippet: "The monorail has no senior rate, even though other local transport services may have one.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps senior no when the merchant lacks a senior discount but another retailer is mentioned later", () => {
    const result = runEval([
      {
        term_id: "22-senior-cross",
        country: "UK",
        term_name: "Luxe Perfumes",
        domain: "luxeperfumes.com",
        subclass: "senior",
        source_type: "aimode",
        snippet: "There is no direct evidence of a senior discount for Luxe Perfumes. Some other retailers such as The Fragrance Shop may run separate senior offers.",
      },
      {
        term_id: "22-senior-cross",
        country: "UK",
        term_name: "Luxe Perfumes",
        domain: "luxeperfumes.com",
        subclass: "senior",
        source_type: "searchlab",
        snippet: "No public senior rate is listed for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps birthday no when Korean text says no direct birthday-discount mention exists", () => {
    const result = runEval([
      {
        term_id: "22b",
        country: "KR",
        term_name: "Store K",
        domain: "storek.kr",
        subclass: "birthday",
        source_type: "aimode",
        snippet: "생일 할인 혜택에 대한 직접적인 언급은 찾을 수 없습니다. 멤버십 혜택만 소개됩니다.",
      },
      {
        term_id: "22b",
        country: "KR",
        term_name: "Store K",
        domain: "storek.kr",
        subclass: "birthday",
        source_type: "searchlab",
        snippet: "No direct birthday discount is mentioned.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps birthday no when the snippet is about the brand's anniversary rather than the customer's birthday", () => {
    const result = runEval([
      {
        term_id: "22c",
        country: "PL",
        term_name: "Agata",
        domain: "agata.example",
        subclass: "birthday",
        source_type: "aimode",
        snippet:
          "Tak, sklep organizuje promocje z okazji urodzin marki. To akcja ogólnosklepowa, a nie indywidualny rabat urodzinowy dla klienta.",
      },
      {
        term_id: "22c",
        country: "PL",
        term_name: "Agata",
        domain: "agata.example",
        subclass: "birthday",
        source_type: "searchlab",
        snippet: "This is the brand's anniversary sale, not a customer birthday discount.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps senior no for German no-specific-senior-discount wording", () => {
    const result = runEval([
      {
        term_id: "22a",
        country: "DE",
        term_name: "Fanshop",
        domain: "fanshop.de",
        subclass: "senior",
        source_type: "aimode",
        snippet:
          "Es gibt im offiziellen Online-Fanshop keinen spezifischen, dauerhaften Seniorenrabatt. Die Bezeichnung Senior bezieht sich nur auf die Größe für Erwachsene.",
      },
      {
        term_id: "22a",
        country: "DE",
        term_name: "Fanshop",
        domain: "fanshop.de",
        subclass: "senior",
        source_type: "searchlab",
        snippet: "Senior refers to adult sizing, not a senior customer discount.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps student no when the snippet says there is no official student discount", () => {
    const result = runEval([
      {
        term_id: "23",
        country: "UK",
        term_name: "LoftZone",
        domain: "loftzone.co.uk",
        subclass: "student",
        source_type: "aimode",
        snippet: "目前不提供官方的学生折扣。该品牌主要通过推荐计划和节日促销提供优惠。",
      },
      {
        term_id: "23",
        country: "UK",
        term_name: "LoftZone",
        domain: "loftzone.co.uk",
        subclass: "student",
        source_type: "searchlab",
        snippet: "There is no official student discount for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps employee no for Spanish and Polish no-public-info phrasings", () => {
    const result = runEval([
      {
        term_id: "24",
        country: "ES",
        term_name: "1001Neumaticos",
        domain: "1001neumaticos.es",
        subclass: "employee",
        source_type: "aimode",
        snippet: "1001Neumaticos no anuncia explícitamente descuentos para empleados en su sitio web o menciones legales.",
      },
      {
        term_id: "24",
        country: "PL",
        term_name: "LuxCamp",
        domain: "luxcamp.pl",
        subclass: "employee",
        source_type: "searchlab",
        snippet: "LuxCamp nie publikuje publicznie informacji o specjalnych zniżkach dedykowanych dla pracowników.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps employee no when benefits do not include a direct employee discount", () => {
    const result = runEval([
      {
        term_id: "24a",
        country: "UK",
        term_name: "Lottoland",
        domain: "lottoland.co.uk",
        subclass: "employee",
        source_type: "aimode",
        snippet:
          "Lottoland 的福利体系中并不包含针对其产品的直接员工折扣，员工福利主要侧重于健康、生活平衡和职场激励。",
      },
      {
        term_id: "24a",
        country: "UK",
        term_name: "Lottoland",
        domain: "lottoland.co.uk",
        subclass: "employee",
        source_type: "searchlab",
        snippet: "There is no direct employee discount on products.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects return yes from an explicit merchant return policy even without free returns", () => {
    const result = runEval([
      {
        term_id: "25",
        country: "DE",
        term_name: "FC Shop",
        domain: "fcshop.de",
        subclass: "return",
        source_type: "aimode",
        snippet: "Rücksendungen müssen über das Retourenportal angemeldet werden and refunds are processed to the original payment method within 14 days.",
      },
      {
        term_id: "25",
        country: "DE",
        term_name: "FC Shop",
        domain: "fcshop.de",
        subclass: "return",
        source_type: "searchlab",
        snippet: "Customers can register a return and receive a refund after the return is processed.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("does not turn paid return shipping into return no when a return policy exists", () => {
    const result = runEval([
      {
        term_id: "25a",
        country: "US",
        term_name: "M416GelBlaster",
        domain: "m416gelblaster.com",
        subclass: "return",
        source_type: "aimode",
        snippet: "M416GelBlaster provides a 30-day return guarantee. The policy does not explicitly state that return shipping is free for all cases.",
      },
      {
        term_id: "25a",
        country: "US",
        term_name: "M416GelBlaster",
        domain: "m416gelblaster.com",
        subclass: "return",
        source_type: "searchlab",
        snippet: "Customers can return eligible items if there is an issue and receive a refund after review.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps blue light card no when the snippet explicitly says there is no information it is supported", () => {
    const result = runEval([
      {
        term_id: "26",
        country: "KR",
        term_name: "29CM",
        domain: "29cm.co.kr",
        subclass: "blue light card",
        source_type: "aimode",
        snippet: "29CM가 공식적으로 Blue Light Card 할인을 제공한다는 정보는 없습니다.",
      },
      {
        term_id: "26",
        country: "KR",
        term_name: "29CM",
        domain: "29cm.co.kr",
        subclass: "blue light card",
        source_type: "searchlab",
        snippet: "The merchant does not directly support Blue Light Card.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps family no for explicit no-family-discount wording in German and Korean", () => {
    const result = runEval([
      {
        term_id: "27",
        country: "DE",
        term_name: "LEBENSKRAFTPUR",
        domain: "lebenskraftpur.de",
        subclass: "family",
        source_type: "aimode",
        snippet: "Das Unternehmen bietet keine speziellen Familienrabatte an und hat keinen generellen Geschwisterrabatt.",
      },
      {
        term_id: "27",
        country: "KR",
        term_name: "29CM",
        domain: "29cm.co.kr",
        subclass: "family",
        source_type: "searchlab",
        snippet: "29CM는 공식적으로 별도의 가족 결합 혜택을 제공하지 않습니다.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects gift card yes for explicit gift voucher availability", () => {
    const result = runEval([
      {
        term_id: "28",
        country: "DE",
        term_name: "123schlafen",
        domain: "123schlafen.de",
        subclass: "gift card",
        source_type: "aimode",
        snippet: "Es gibt digitale Geschenkgutscheine, die per E-Mail versendet und sofort eingelöst werden können.",
      },
      {
        term_id: "28",
        country: "UK",
        term_name: "& Other Stories",
        domain: "stories.com",
        subclass: "gift card",
        source_type: "searchlab",
        snippet: "Gift cards are available in digital and physical formats and can be used online and in stores.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps gift card no when the snippet only describes self-use discount codes", () => {
    const result = runEval([
      {
        term_id: "29",
        country: "DE",
        term_name: "Sonderposten",
        domain: "sonderposten.de",
        subclass: "gift card",
        source_type: "aimode",
        snippet: "Diese Gutscheine sind primär Rabattcodes für den eigenen Einkauf und nicht als klassische Geschenkkarte zum Weiterverschenken gedacht.",
      },
      {
        term_id: "29",
        country: "DE",
        term_name: "Sonderposten",
        domain: "sonderposten.de",
        subclass: "gift card",
        source_type: "searchlab",
        snippet: "It is not a classic gift card product.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects newsletter yes from welcome discounts and exclusive newsletter offers", () => {
    const result = runEval([
      {
        term_id: "30",
        country: "DE",
        term_name: "123Lack",
        domain: "123lack.de",
        subclass: "newsletter/first order/sign up/",
        source_type: "aimode",
        snippet: "Durch die Anmeldung zum Newsletter können Kunden exklusive Angebote und Gutscheincodes erhalten.",
      },
      {
        term_id: "30",
        country: "UK",
        term_name: "& Other Stories",
        domain: "stories.com",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "New subscribers receive a welcome discount code sent to their inbox after newsletter sign-up.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("detects newsletter yes from Chinese email-signup first-order wording", () => {
    const result = runEval([
      {
        term_id: "30a",
        country: "UK",
        term_name: "Lunara",
        domain: "try-lunara.com",
        subclass: "newsletter/first order/sign up/",
        source_type: "aimode",
        snippet:
          "提供针对新订阅者的首单优惠，通常在用户注册电子邮件时发放。通过订阅电子邮件，新用户可以获得首单折扣代码和欢迎邮件。",
      },
      {
        term_id: "30a",
        country: "UK",
        term_name: "Lunara",
        domain: "try-lunara.com",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet:
          "新用户在注册电子邮件后会收到首单优惠码，并可获得后续独家折扣通知。",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps newsletter yes when a sentence contrasts standard first-order language with an actual newsletter code", () => {
    const result = runEval([
      {
        term_id: "30b",
        country: "UK",
        term_name: "McCausland Airport Car Park",
        domain: "mccausland.co.uk",
        subclass: "newsletter/first order/sign up/",
        source_type: "aimode",
        snippet:
          "McCausland Airport Car Park does not explicitly offer a standard first-order discount, but users can get up to 10% off by signing up for their specific newsletter and using a provided discount code.",
      },
      {
        term_id: "30b",
        country: "UK",
        term_name: "McCausland Airport Car Park",
        domain: "mccausland.co.uk",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet:
          "Newsletter sign-up gives a provided discount code for eligible bookings.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps referral no for affiliate-only or creator commission programs", () => {
    const result = runEval([
      {
        term_id: "30c",
        country: "UK",
        term_name: "Lovense",
        domain: "lovense.com",
        subclass: "referral",
        source_type: "aimode",
        snippet:
          "Lovense does not provide a standard refer-a-friend discount for normal consumers. Its affiliate program is aimed at bloggers and creators who earn commission from referred sales.",
      },
      {
        term_id: "30c",
        country: "UK",
        term_name: "Lovense",
        domain: "lovense.com",
        subclass: "referral",
        source_type: "searchlab",
        snippet: "This is an affiliate commission program rather than a public consumer referral discount.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps referral no for Chinese wording that says there is no formal refer-a-friend program", () => {
    const result = runEval([
      {
        term_id: "30c2",
        country: "UK",
        term_name: "192.com",
        domain: "192.com",
        subclass: "referral",
        source_type: "aimode",
        snippet:
          "192.com 不提供正式的推荐好友优惠或奖励计划，现有折扣通常仅来自官方邮件折扣和季节性促销代码。",
      },
      {
        term_id: "30c2",
        country: "UK",
        term_name: "192.com",
        domain: "192.com",
        subclass: "referral",
        source_type: "searchlab",
        snippet: "There is no formal refer-a-friend reward program for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps referral no when there is no direct evidence for the merchant and later text mentions another brand", () => {
    const result = runEval([
      {
        term_id: "30c3",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "referral",
        source_type: "aimode",
        snippet: "There is no direct evidence of a referral program for Socktopus. The text later mentions Octopus Energy, which has a separate refer-a-friend reward.",
      },
      {
        term_id: "30c3",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "referral",
        source_type: "searchlab",
        snippet: "No public consumer referral program is listed for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps first responder no when same-name cross-entity text later mentions other brands with responder programs", () => {
    const result = runEval([
      {
        term_id: "cross-fr-1",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "first responder",
        source_type: "aimode",
        snippet:
          "There is no evidence that Socktopus offers a dedicated first responder discount. Alternative brands may offer verified responder programs, but those do not apply to this merchant.",
      },
      {
        term_id: "cross-fr-1",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "first responder",
        source_type: "searchlab",
        snippet: "No specific first responder discount is listed for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps military no when the merchant has no military program and another brand is mentioned later", () => {
    const result = runEval([
      {
        term_id: "cross-mil-1",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "military",
        source_type: "aimode",
        snippet:
          "Socktopus does not specifically list a year-round military discount. Octopus Energy and other brands may run separate verified military offers, but that is unrelated to this merchant.",
      },
      {
        term_id: "cross-mil-1",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "military",
        source_type: "searchlab",
        snippet: "No standing military discount is listed for Socktopus itself.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps referral no for member-get-member club recruitment rather than retail referral discount", () => {
    const result = runEval([
      {
        term_id: "30d",
        country: "DE",
        term_name: "1. FC Koln Fanshop",
        domain: "fc-fanshop.de",
        subclass: "referral",
        source_type: "aimode",
        snippet:
          "Mitglieder werben neue Mitglieder und erhalten dafur Pramien. Es handelt sich primar um eine Aktion des Vereins und nicht um eine direkte Rabattaktion im Fanshop-Verkauf.",
      },
      {
        term_id: "30d",
        country: "DE",
        term_name: "1. FC Koln Fanshop",
        domain: "fc-fanshop.de",
        subclass: "referral",
        source_type: "searchlab",
        snippet:
          "The member-get-member benefit is tied to club membership recruitment, not a standard retail refer-a-friend discount.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps military no when Chinese text says no public military discount and mentions Military Green only as a color", () => {
    const result = runEval([
      {
        term_id: "30e",
        country: "US",
        term_name: "Louise Carmen",
        domain: "louisecarmen.com",
        subclass: "military",
        source_type: "aimode",
        snippet:
          "目前没有公开信息表明该品牌提供专门的退伍军人或现役军人折扣。Military Green 只是产品颜色名，与军事优惠政策无关。",
      },
      {
        term_id: "30e",
        country: "US",
        term_name: "Louise Carmen",
        domain: "louisecarmen.com",
        subclass: "military",
        source_type: "searchlab",
        snippet: "No dedicated military discount is listed for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps military no for German no-public-evidence wording about Bundeswehr or military personnel", () => {
    const result = runEval([
      {
        term_id: "30f",
        country: "DE",
        term_name: "1. FC Koln Fanshop",
        domain: "fc-fanshop.de",
        subclass: "military",
        source_type: "aimode",
        snippet:
          "Es gibt keine offentlichen Informationen uber spezielle Rabattaktionen fur Bundeswehrangehorige oder Militarpersonal. Der Shop nennt keinen speziellen Militarrabatt.",
      },
      {
        term_id: "30f",
        country: "DE",
        term_name: "1. FC Koln Fanshop",
        domain: "fc-fanshop.de",
        subclass: "military",
        source_type: "searchlab",
        snippet: "No special military discount is listed.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps military no for German direct-no-hint phrasing", () => {
    const result = runEval([
      {
        term_id: "30g",
        country: "DE",
        term_name: "Meine LEDs",
        domain: "meine-leds.de",
        subclass: "military",
        source_type: "aimode",
        snippet:
          "Basierend auf den Suchergebnissen gibt es keinen direkten Hinweis auf einen speziellen Militärrabatt bei diesem Anbieter. Stattdessen gibt es nur allgemeine Gutscheine und Cashback.",
      },
      {
        term_id: "30g",
        country: "DE",
        term_name: "Meine LEDs",
        domain: "meine-leds.de",
        subclass: "military",
        source_type: "searchlab",
        snippet: "No special military discount is listed.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps aaa no when the snippet says no direct AAA discount evidence exists", () => {
    const result = runEval([
      {
        term_id: "30h",
        country: "PL",
        term_name: "Lurso",
        domain: "lurso.example",
        subclass: "aaa",
        source_type: "aimode",
        snippet:
          "Nie znaleziono żadnych dowodów na to, że merchant oferuje zniżkę AAA. Brak informacji o programach rabatowych typu AAA.",
      },
      {
        term_id: "30h",
        country: "PL",
        term_name: "Lurso",
        domain: "lurso.example",
        subclass: "aaa",
        source_type: "searchlab",
        snippet: "No AAA discount is confirmed for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps aaa no when Korean text says the merchant is not an AAA discount partner", () => {
    const result = runEval([
      {
        term_id: "30i",
        country: "KR",
        term_name: "Dior",
        domain: "dior.example",
        subclass: "aaa",
        source_type: "aimode",
        snippet:
          "디올은 AAA 멤버십 할인 제휴처가 아니며 공식 온라인몰에서는 AAA 할인 혜택을 받을 수 없습니다.",
      },
      {
        term_id: "30i",
        country: "KR",
        term_name: "Dior",
        domain: "dior.example",
        subclass: "aaa",
        source_type: "searchlab",
        snippet: "This merchant is not an AAA participating partner.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects existing customer yes from renewal-offer wording", () => {
    const result = runEval([
      {
        term_id: "30j",
        country: "UK",
        term_name: "Magazines Direct",
        domain: "magazinesdirect.com",
        subclass: "existing customer",
        source_type: "aimode",
        snippet:
          "Existing customers can log in and view renewal offers. Current subscribers receive more competitive renewal pricing in their account area.",
      },
      {
        term_id: "30j",
        country: "UK",
        term_name: "Magazines Direct",
        domain: "magazinesdirect.com",
        subclass: "existing customer",
        source_type: "searchlab",
        snippet: "Renewal offers and existing-subscriber discounts are available after login.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps existing customer unknown when the snippet rejects a formal loyalty discount but mentions ad hoc returning-customer perks", () => {
    const result = runEval([
      {
        term_id: "30j1",
        country: "US",
        term_name: "Level 99 Games",
        domain: "level99games.com",
        subclass: "existing customer",
        source_type: "aimode",
        snippet:
          "Level 99 Games 不提供传统意义上的现有客户永久折扣或正式的忠诚度计划。不过，公司通过特定的参与式项目和定期促销活动为老客户提供优惠途径。",
      },
      {
        term_id: "30j1",
        country: "US",
        term_name: "Level 99 Games",
        domain: "level99games.com",
        subclass: "existing customer",
        source_type: "searchlab",
        snippet: "There is no formal existing-customer discount program, only occasional project-based offers.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("unknown");
  });

  it("keeps existing customer no when the snippet explicitly says no permanent existing-customer discount exists", () => {
    const result = runEval([
      {
        term_id: "30j1a",
        country: "UK",
        term_name: "Mad About Horror",
        domain: "madabouthorror.co.uk",
        subclass: "existing customer",
        source_type: "aimode",
        snippet:
          'Mad About Horror does not offer a permanent "existing customer" discount, but it does run seasonal sales and birthday coupons.',
      },
      {
        term_id: "30j1a",
        country: "UK",
        term_name: "Mad About Horror",
        domain: "madabouthorror.co.uk",
        subclass: "existing customer",
        source_type: "searchlab",
        snippet: "There is no formal existing-customer discount program.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps existing customer no when the snippet says there is no formal program and only seasonal offers remain", () => {
    const result = runEval([
      {
        term_id: "30j1b",
        country: "UK",
        term_name: "Residual Shop",
        domain: "residualshop.co.uk",
        subclass: "existing customer",
        source_type: "aimode",
        snippet:
          "Residual Shop does not offer a formal existing customer discount program. Returning buyers may still see seasonal promotions from time to time.",
      },
      {
        term_id: "30j1b",
        country: "UK",
        term_name: "Residual Shop",
        domain: "residualshop.co.uk",
        subclass: "existing customer",
        source_type: "searchlab",
        snippet: "No formal existing-customer program is listed.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps existing customer no when another same-name company has the program instead", () => {
    const result = runEval([
      {
        term_id: "30j1c",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "existing customer",
        source_type: "aimode",
        snippet:
          "Socktopus does not offer a formal existing customer rewards program. Octopus Energy has Octoplus rewards for its own customers, but that is a separate company and should not be confused with Socktopus.",
      },
      {
        term_id: "30j1c",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "existing customer",
        source_type: "searchlab",
        snippet: "No formal existing-customer discount program is listed for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("downgrades existing customer to unknown when a same-name company has the benefit but the merchant itself is unclear", () => {
    const result = runEval([
      {
        term_id: "30j1d",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "existing customer",
        source_type: "aimode",
        snippet:
          "There are two distinct entities mentioned: Socktopus and Octopus Energy. Octoplus rewards provide perks for Octopus Energy customers, but that is a separate company.",
      },
      {
        term_id: "30j1d",
        country: "UK",
        term_name: "Socktopus",
        domain: "socktopus.co.uk",
        subclass: "existing customer",
        source_type: "searchlab",
        snippet: "The search results mix same-name entities, so an existing-customer program for Socktopus itself is not confirmed.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("unknown");
  });

  it("detects new customer no from German no-general-neukundenrabatt wording", () => {
    const result = runEval([
      {
        term_id: "30j2",
        country: "DE",
        term_name: "Fanshop",
        domain: "fanshop.de",
        subclass: "new customer",
        source_type: "aimode",
        snippet:
          "Beim Fanshop gibt es aktuell keinen allgemeinen Neukundenrabatt. Stattdessen gibt es Mitgliedervorteile und wechselnde Sale-Aktionen.",
      },
      {
        term_id: "30j2",
        country: "DE",
        term_name: "Fanshop",
        domain: "fanshop.de",
        subclass: "new customer",
        source_type: "searchlab",
        snippet: "There is no general new-customer discount listed.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps referral no when Korean text says no separate friend-referral discount is listed", () => {
    const result = runEval([
      {
        term_id: "30j3",
        country: "KR",
        term_name: "Goldendew",
        domain: "goldendew.example",
        subclass: "referral",
        source_type: "aimode",
        snippet: "별도의 친구 추천 할인 혜택은 명시되어 있지 않습니다. 일반 회원 혜택만 제공됩니다.",
      },
      {
        term_id: "30j3",
        country: "KR",
        term_name: "Goldendew",
        domain: "goldendew.example",
        subclass: "referral",
        source_type: "searchlab",
        snippet: "No separate friend-referral discount is listed.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps price guarantee no when Spanish text says there is no public sign of a best-price guarantee", () => {
    const result = runEval([
      {
        term_id: "30j4",
        country: "ES",
        term_name: "Pedalmoto",
        domain: "pedalmoto.example",
        subclass: "price guarantee",
        source_type: "aimode",
        snippet:
          'Basado en la información disponible, no hay indicios públicos o explícitos de que la tienda ofrezca una "garantía de mejor precio" o igualación de precios.',
      },
      {
        term_id: "30j4",
        country: "ES",
        term_name: "Pedalmoto",
        domain: "pedalmoto.example",
        subclass: "price guarantee",
        source_type: "searchlab",
        snippet: "No public evidence confirms a price-match or best-price guarantee.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps price guarantee no when a mojibake Spanish snippet still says no public evidence exists", () => {
    const result = runEval([
      {
        term_id: "30j4b",
        country: "ES",
        term_name: "Pedalmoto",
        domain: "pedalmoto.example",
        subclass: "price guarantee",
        source_type: "searchlab",
        snippet:
          'Basado en la informaci贸n disponible, no hay indicios p煤blicos o expl铆citos de que Pedalmoto ofrezca una "garant铆a de mejor precio" o igualaci贸n de precios contra la competencia.',
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps return unknown when free returns depend on seller-level policy", () => {
    const result = runEval([
      {
        term_id: "30j5",
        country: "KR",
        term_name: "eBay",
        domain: "ebay.example",
        subclass: "return",
        source_type: "aimode",
        snippet:
          "eBay는 판매자가 반품 정책(무료 반품 또는 구매자 부담)을 설정합니다. 상품 페이지의 Returns 섹션을 통해 무료 반품 여부를 확인해야 합니다.",
      },
      {
        term_id: "30j5",
        country: "KR",
        term_name: "eBay",
        domain: "ebay.example",
        subclass: "return",
        source_type: "searchlab",
        snippet: 'Check the product page for whether "Free 30-day returns" applies to that listing.',
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("unknown");
  });

  it("keeps aaa no when Korean text says no direct AAA discount information is available", () => {
    const result = runEval([
      {
        term_id: "30j6",
        country: "KR",
        term_name: "29CM",
        domain: "29cm.example",
        subclass: "aaa",
        source_type: "aimode",
        snippet: "AAA 브랜드 할인 혜택이 있는지에 대한 직접적인 정보는 제공된 검색 결과에서 확인되지 않았습니다.",
      },
      {
        term_id: "30j6",
        country: "KR",
        term_name: "29CM",
        domain: "29cm.example",
        subclass: "aaa",
        source_type: "searchlab",
        snippet: "No direct AAA discount information is available for this merchant.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps aaa no when a Polish mojibake snippet says no evidence of an AAA discount exists", () => {
    const result = runEval([
      {
        term_id: "30j6b",
        country: "PL",
        term_name: "Lurso",
        domain: "lurso.example",
        subclass: "aaa",
        source_type: "searchlab",
        snippet:
          "Na podstawie dost臋pnych informacji, nie znaleziono 偶adnych dowod贸w na to, 偶e merchant oferuje zni偶k臋 AAA. Brak informacji o programach rabatowych typu AAA w wynikach wyszukiwania.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps first responder unknown when the snippet mixes the merchant with other same-name brands", () => {
    const result = runEval([
      {
        term_id: "30k",
        country: "US",
        term_name: "Midnight",
        domain: "midnight.example",
        subclass: "first responder",
        source_type: "aimode",
        snippet:
          "Midnight Moon offers a first responder discount. Other Midnight brands have different policies, so the exact merchant remains unclear.",
      },
      {
        term_id: "30k",
        country: "US",
        term_name: "Midnight",
        domain: "midnight.example",
        subclass: "first responder",
        source_type: "searchlab",
        snippet: "If you are referring to other Midnight brands, policies vary.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("unknown");
  });

  it("keeps student no for explicit German and Spanish no-student-discount phrasing", () => {
    const result = runEval([
      {
        term_id: "31",
        country: "DE",
        term_name: "Loveplants",
        domain: "loveplants.de",
        subclass: "student",
        source_type: "aimode",
        snippet: "Es gibt derzeit keinen spezifischen, öffentlich bekannten Studentenrabatt direkt bei Loveplants.",
      },
      {
        term_id: "31",
        country: "ES",
        term_name: "Propósito Salud",
        domain: "propositosalud.es",
        subclass: "student",
        source_type: "searchlab",
        snippet: "No hay información específica que confirme descuentos para estudiantes.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects NL shipping yes and extracts euro threshold from vanaf phrasing", () => {
    const result = runEval([
      {
        term_id: "nl-shipping-yes",
        country: "NL",
        term_name: "vidaXL",
        domain: "vidaxl.nl",
        subclass: "shipping",
        source_type: "searchlab",
        snippet: "Ja, vidaXL.nl biedt gratis verzending aan. Bestellingen met een totale waarde vanaf €70 worden gratis bezorgd.",
      },
      {
        term_id: "nl-shipping-yes",
        country: "NL",
        term_name: "vidaXL",
        domain: "vidaxl.nl",
        subclass: "shipping",
        source_type: "aimode",
        snippet: "Gratis verzending geldt vanaf €70. Onder de €70 betaal je €4,99 verzendkosten.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
    expect(result.debugRows[0].final_value).toBe("min_free_shipping: 70 EUR");
  });

  it("keeps NL shipping no when physical shipping is not applicable", () => {
    const result = runEval([
      {
        term_id: "nl-shipping-no",
        country: "NL",
        term_name: "Sunweb",
        domain: "sunweb.nl",
        subclass: "shipping",
        source_type: "searchlab",
        snippet: "Sunweb is een online reisorganisatie en gratis verzending is niet van toepassing. Er is geen sprake van verzendkosten voor fysieke producten.",
      },
      {
        term_id: "nl-shipping-no",
        country: "NL",
        term_name: "Sunweb",
        domain: "sunweb.nl",
        subclass: "shipping",
        source_type: "aimode",
        snippet: "Geen gratis verzending: het gaat om digitale boekingen en niet om fysieke levering.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
    expect(result.debugRows[0].final_value).toBe("");
  });

  it("detects FR shipping yes and extracts euro threshold from a partir de phrasing", () => {
    const result = runEval([
      {
        term_id: "fr-shipping-yes",
        country: "FR",
        term_name: "Victorinox",
        domain: "victorinox.com",
        subclass: "shipping",
        source_type: "searchlab",
        snippet: "Victorinox propose la livraison gratuite a partir de 50 EUR en France. En dessous de ce montant, des frais de port s'appliquent.",
      },
      {
        term_id: "fr-shipping-yes",
        country: "FR",
        term_name: "Victorinox",
        domain: "victorinox.com",
        subclass: "shipping",
        source_type: "aimode",
        snippet: "Livraison offerte des 50 EUR d'achat.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
    expect(result.debugRows[0].final_value).toBe("min_free_shipping: 50 EUR");
  });

  it("keeps FR shipping no for service-only merchants", () => {
    const result = runEval([
      {
        term_id: "fr-shipping-no",
        country: "FR",
        term_name: "Dekra",
        domain: "dekra-norisko.fr",
        subclass: "shipping",
        source_type: "searchlab",
        snippet: "Le site dekra-norisko.fr ne propose pas de livraison gratuite car il s'agit d'un prestataire de services et non d'un site de vente de produits physiques.",
      },
      {
        term_id: "fr-shipping-no",
        country: "FR",
        term_name: "Dekra",
        domain: "dekra-norisko.fr",
        subclass: "shipping",
        source_type: "aimode",
        snippet: "Pas de livraison gratuite: il s'agit d'un service de controle technique.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects NL student yes/no phrasing", () => {
    const yesResult = runEval([
      {
        term_id: "nl-student-yes",
        country: "NL",
        term_name: "Kamera Express",
        domain: "kamera-express.nl",
        subclass: "student",
        source_type: "searchlab",
        snippet: "Kamera Express biedt studentenkorting aan. Studenten krijgen 10% korting op geselecteerde merken.",
      },
      {
        term_id: "nl-student-yes",
        country: "NL",
        term_name: "Kamera Express",
        domain: "kamera-express.nl",
        subclass: "student",
        source_type: "aimode",
        snippet: "Er is korting voor studenten op geselecteerde producten.",
      },
    ]);
    const noResult = runEval([
      {
        term_id: "nl-student-no",
        country: "NL",
        term_name: "Sunweb",
        domain: "sunweb.nl",
        subclass: "student",
        source_type: "searchlab",
        snippet: "Sunweb.nl heeft geen structurele, vaste studentenkorting.",
      },
      {
        term_id: "nl-student-no",
        country: "NL",
        term_name: "Sunweb",
        domain: "sunweb.nl",
        subclass: "student",
        source_type: "aimode",
        snippet: "Geen officiele studentenkorting gevonden.",
      },
    ]);

    expect(yesResult.debugRows[0].final_supported).toBe("yes");
    expect(noResult.debugRows[0].final_supported).toBe("no");
  });

  it("detects FR student yes/no phrasing", () => {
    const yesResult = runEval([
      {
        term_id: "fr-student-yes",
        country: "FR",
        term_name: "Orange",
        domain: "orange.fr",
        subclass: "student",
        source_type: "searchlab",
        snippet: "La boutique Orange propose une reduction etudiante avec une remise reservee aux 18-26 ans.",
      },
      {
        term_id: "fr-student-yes",
        country: "FR",
        term_name: "Orange",
        domain: "orange.fr",
        subclass: "student",
        source_type: "aimode",
        snippet: "Offre etudiante: remise sur certains forfaits pour les jeunes.",
      },
    ]);
    const noResult = runEval([
      {
        term_id: "fr-student-no",
        country: "FR",
        term_name: "Courir",
        domain: "courir.com",
        subclass: "student",
        source_type: "searchlab",
        snippet: "Courir.com ne propose generalement pas de reduction specifique pour les etudiants.",
      },
      {
        term_id: "fr-student-no",
        country: "FR",
        term_name: "Courir",
        domain: "courir.com",
        subclass: "student",
        source_type: "aimode",
        snippet: "Pas de reduction etudiante dediee.",
      },
    ]);

    expect(yesResult.debugRows[0].final_supported).toBe("yes");
    expect(noResult.debugRows[0].final_supported).toBe("no");
  });

  it("detects NL newsletter yes with euro sign-up discount", () => {
    const result = runEval([
      {
        term_id: "nl-newsletter-yes",
        country: "NL",
        term_name: "vidaXL",
        domain: "vidaxl.nl",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "Bij vidaXL.nl ontvang je een korting van €5 zodra je je inschrijft voor de nieuwsbrief.",
      },
      {
        term_id: "nl-newsletter-yes",
        country: "NL",
        term_name: "vidaXL",
        domain: "vidaxl.nl",
        subclass: "newsletter/first order/sign up/",
        source_type: "aimode",
        snippet: "Schrijf je in voor de nieuwsbrief en ontvang €5 korting op je eerste bestelling.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
    expect(result.debugRows[0].final_value).toBe("5 EUR");
  });

  it("detects FR newsletter yes and prefers FR-localized official URL", () => {
    const result = runEval([
      {
        term_id: "fr-newsletter-yes",
        country: "FR",
        term_name: "Courir",
        domain: "courir.com",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "Courir offre generalement une reduction de 10% sur la premiere commande lors de l'inscription a la newsletter.",
        url: "https://www.courir.com/en-ww/newsletter",
      },
      {
        term_id: "fr-newsletter-yes",
        country: "FR",
        term_name: "Courir",
        domain: "courir.com",
        subclass: "newsletter/first order/sign up/",
        source_type: "aimode",
        snippet: "Inscrivez-vous a la newsletter pour profiter d'une offre de bienvenue.",
        url: "https://www.courir.com/fr-fr/newsletter-inscription",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
    expect(result.debugRows[0].final_value).toBe("10%");
    expect(result.debugRows[0].final_url).toBe("https://www.courir.com/fr-fr/newsletter-inscription");
  });

  it("keeps NL newsletter no when the snippet says the discount is not directly confirmed", () => {
    const result = runEval([
      {
        term_id: "nl-newsletter-no-confirmed",
        country: "NL",
        term_name: "100%Hardcore",
        domain: "100procenthardcore.com",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "Op basis van de beschikbare informatie is niet direct bevestigd dat 100procenthardcore.com een automatische korting geeft bij inschrijving voor de nieuwsbrief.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps FR newsletter no when another entity offers the newsletter discount", () => {
    const result = runEval([
      {
        term_id: "fr-newsletter-cross-entity-no",
        country: "FR",
        term_name: "Terrésens",
        domain: "terressens.com",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "Il semble y avoir une confusion entre deux entites distinctes: Terres de France propose une reduction pour l'inscription a leur newsletter, mais Terrésens n'indique pas de reduction directe systematique pour sa propre newsletter.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects FR student yes when the offer is explicitly available via student verification partners", () => {
    const result = runEval([
      {
        term_id: "fr-student-partner-yes",
        country: "FR",
        term_name: "& other stories",
        domain: "stories.com",
        subclass: "student",
        source_type: "searchlab",
        snippet: "& Other Stories propose une reduction etudiant de 12 % accessible via UNiDAYS ou Student Beans.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps FR shipping no when only standard shipping fees are described", () => {
    const result = runEval([
      {
        term_id: "fr-shipping-standard-fee-no",
        country: "FR",
        term_name: "Terrésens",
        domain: "terressens.com",
        subclass: "shipping",
        source_type: "searchlab",
        snippet: "Le site utilise une plateforme Spreadshop, ce qui implique des frais de port standards plutot qu'une livraison gratuite automatique sur tout.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps NL shipping no when shipping is not applicable to digital courses", () => {
    const result = runEval([
      {
        term_id: "nl-shipping-digital-no",
        country: "NL",
        term_name: "123-theorie",
        domain: "123-theorie.nl",
        subclass: "shipping",
        source_type: "searchlab",
        snippet: "Aangezien het hier gaat om digitale diensten en cursussen, is gratis verzending niet van toepassing op fysieke producten.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps NL student no when school-themed promo codes are only comparable to student discounts", () => {
    const result = runEval([
      {
        term_id: "nl-student-school-code-no",
        country: "NL",
        term_name: "123-theorie",
        domain: "123-theorie.nl",
        subclass: "student",
        source_type: "searchlab",
        snippet: "123-theorie.nl biedt regelmatig kortingen aan, waaronder acties die vergelijkbaar zijn met studentenkortingen. Er is geen dedicated studentenkorting bevestigd.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps FR student no when the merchant is not in student discount programs", () => {
    const result = runEval([
      {
        term_id: "fr-student-program-no",
        country: "FR",
        term_name: "1001 Casquettes",
        domain: "1001casquettes.com",
        subclass: "student",
        source_type: "searchlab",
        snippet: "Pas de partenariat etudiant : le site ne figure pas dans les programmes de reduction etudiants courants comme UNiDAYS.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps FR newsletter no when the offer is not explicitly confirmed", () => {
    const result = runEval([
      {
        term_id: "fr-newsletter-not-confirmed-no",
        country: "FR",
        term_name: "100percent",
        domain: "100percent.eu",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "Il n'est pas explicitement confirme que 100percent.eu offre une reduction systematique uniquement pour l'inscription a la newsletter.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps FR newsletter no for explicit 'not indicated' and 'not mentioned' variants from addon residuals", () => {
    const result = runEval([
      {
        term_id: "fr-newsletter-residual-no-1",
        country: "FR",
        term_name: "1001 Coffres",
        domain: "1001coffres.com",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "D'apres les informations disponibles, il n'est pas explicitement indique que 1001coffres.com offre une reduction immediate pour l'inscription a la newsletter.",
      },
      {
        term_id: "fr-newsletter-residual-no-2",
        country: "FR",
        term_name: "1001 deguisement",
        domain: "1001deguisement.fr",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "1001deguisement.fr ne mentionne pas explicitement une reduction liee specifiquement a l'inscription a la newsletter. Une offre Facebook de 5% existe separement.",
      },
      {
        term_id: "fr-newsletter-residual-no-3",
        country: "FR",
        term_name: "1001 Lits",
        domain: "1001lits.com",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "1001lits.com ne mentionne pas explicitement de reduction immediate offerte specifiquement pour l'inscription a la newsletter.",
      },
      {
        term_id: "fr-newsletter-residual-no-4",
        country: "FR",
        term_name: "1001 montres",
        domain: "1001-montres.fr",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "Il n'est pas indique de reduction automatique ou permanente offerte specifiquement pour l'inscription a la newsletter sur 1001-montres.fr.",
      },
      {
        term_id: "fr-newsletter-residual-no-5",
        country: "FR",
        term_name: "1001 Nuits enchantees",
        domain: "1001-nuits-enchantees.fr",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "Les resultats de recherche ne confirment pas specifiquement une reduction immediate pour l'inscription a la newsletter sur 1001-nuits-enchantees.fr.",
      },
    ]);

    expect(result.debugRows.every((row) => row.final_supported === "no")).toBe(true);
    expect(result.debugRows[1].final_value).toBe("");
  });

  it("keeps NL newsletter no when no direct information confirms a fixed sign-up discount", () => {
    const result = runEval([
      {
        term_id: "nl-newsletter-no-direct-info",
        country: "NL",
        term_name: "123-theorie",
        domain: "123-theorie.nl",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "Er is geen directe informatie beschikbaar die bevestigt dat 123-theorie.nl een vaste korting geeft specifiek voor het inschrijven op de nieuwsbrief.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps NL newsletter no for no-direct-indication wording from addon residuals", () => {
    const result = runEval([
      {
        term_id: "nl-newsletter-no-direct-indication",
        country: "NL",
        term_name: "123Apparatuur",
        domain: "123apparatuur.nl",
        subclass: "newsletter/first order/sign up/",
        source_type: "searchlab",
        snippet: "Op basis van de beschikbare informatie is er geen directe aanwijzing dat 123apparatuur.nl een specifieke korting biedt bij inschrijving voor de nieuwsbrief.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps FR student no when there is no specific information confirming a student discount", () => {
    const result = runEval([
      {
        term_id: "fr-student-no-specific-info",
        country: "FR",
        term_name: "100 percent",
        domain: "100percent.eu",
        subclass: "student",
        source_type: "searchlab",
        snippet: "Il n'y a pas d'information specifique confirmant une reduction etudiant sur le site officiel europeen actuel.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("keeps FR student no when no student-specific offer is currently mentioned", () => {
    const result = runEval([
      {
        term_id: "fr-student-currently-mentioned-no",
        country: "FR",
        term_name: "1001 montres",
        domain: "1001-montres.fr",
        subclass: "student",
        source_type: "searchlab",
        snippet: "Il n'y a pas d'offre etudiante specifique actuellement mentionnee sur 1001-montres.fr.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
  });

  it("detects app yes for official mobile app benefits like exclusive vouchers and early access", () => {
    const result = runEval([
      {
        term_id: "32",
        country: "UK",
        term_name: "Lakeland",
        domain: "lakeland.co.uk",
        subclass: "app",
        source_type: "aimode",
        snippet: "By downloading the Lakeland App, users can access exclusive vouchers, partner offers, and early access to special events.",
      },
      {
        term_id: "32",
        country: "UK",
        term_name: "Lakeland",
        domain: "lakeland.co.uk",
        subclass: "app",
        source_type: "searchlab",
        snippet: "The official mobile app includes app-only benefits and digital vouchers.",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
  });

  it("keeps app unknown when the snippet is split across multiple different entities", () => {
    const result = runEval([
      {
        term_id: "33",
        country: "UK",
        term_name: "Air Nation",
        domain: "airnation.example",
        subclass: "app",
        source_type: "aimode",
        snippet: "Air Nation typically refers to several different entities, and app discounts depend on which one you mean.",
      },
      {
        term_id: "33",
        country: "UK",
        term_name: "Air Nation",
        domain: "airnation.example",
        subclass: "app",
        source_type: "searchlab",
        snippet: "To give you the most accurate answer, could you specify which merchant you mean?",
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("unknown");
  });

  it("parses collected-table JSON arrays and keeps final url only from product_urls", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "12",
        query: "Does 4wheelparts.com offer free shipping?",
        country: "US",
        language: "en",
        domain: "4wheelparts.com",
        term_id: "13",
        term_name: "4 Wheel Parts",
        subclass: "shipping",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "抓取完成",
        [GG_COLLECTED_SOURCE_COLUMN]: "search_lab",
        google_url: "https://www.google.com/search?q=Does+4wheelparts.com+offer+free+shipping",
        content: [
          "Yes, 4wheelparts.com offers free standard ground shipping on many items to the contiguous 48 states.",
          "Free shipping typically applies to orders over $99.",
        ],
        product_urls: [
          "https://www.groupon.com/coupons/4-wheel-parts",
          "https://www.4wheelparts.com/shipping-policy",
        ],
        updated_time: "2026-04-08 05:38:49",
      },
      {
        task_id: "12",
        query: "Does 4wheelparts.com offer free shipping?",
        country: "US",
        language: "en",
        domain: "4wheelparts.com",
        term_id: "13",
        term_name: "4 Wheel Parts",
        subclass: "shipping",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "抓取完成",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        google_url: "https://www.google.com/search?q=Does+4wheelparts.com+offer+free+shipping",
        content: [
          "4 Wheel Parts offers free shipping on qualifying orders over $99 within the contiguous United States.",
        ],
        product_urls: [
          "https://www.4wheelparts.com/customer-help/shipping-policy",
        ],
        updated_time: "2026-04-08 05:38:52",
      },
    ]);

    expect(result.totalRows).toBe(2);
    expect(result.debugRows[0].final_supported).toBe("yes");
    expect(result.debugRows[0].final_url).toContain("4wheelparts.com");
    expect(result.debugRows[0].final_url).not.toContain("google.com");
    expect(result.debugRows[0].final_url).not.toContain("groupon.com");
  });

  it("skips rows when content is empty or invalid JSON arrays in csv-style uploads", () => {
    const csvText = [
      `task_id,query,country,language,domain,term_id,term_name,subclass,bu,${GG_COLLECTED_STATUS_COLUMN},${GG_COLLECTED_SOURCE_COLUMN},google_url,content,product_urls,updated_time`,
      '1,"Does shopa.com offer free shipping?",US,en,shopa.com,1,Shop A,shipping,hd,抓取完成,ai_mode,https://www.google.com/search?q=shopa+shipping,"["""" ]","[""https://shopa.com/shipping""]",2026-04-08 05:38:49',
      '2,"Does shopb.com offer free shipping?",US,en,shopb.com,2,Shop B,shipping,hd,抓取完成,search_lab,https://www.google.com/search?q=shopb+shipping,not-json,"[""https://shopb.com/shipping""]",2026-04-08 05:38:49',
      '3,"Does shopc.com offer free shipping?",US,en,shopc.com,3,Shop C,shipping,hd,抓取完成,search_lab,https://www.google.com/search?q=shopc+shipping,"[""Shop C offers free shipping on orders over $25.""]","[""https://shopc.com/shipping-policy""]",2026-04-08 05:38:49',
    ].join("\n");

    const previewBase64 = Buffer.from(csvText, "utf8").toString("base64");
    const preview = previewGgCleaningFile({ fileName: "fixture.csv", fileBase64: previewBase64 }, { skipFileSizeLimit: true });
    const result = executeGgCleaningForEval({ fileName: "fixture.csv", fileBase64: previewBase64 }, { skipFileSizeLimit: true });

    expect(preview.totalRows).toBe(1);
    expect(preview.groupedRows).toBe(1);
    expect(result.totalRows).toBe(1);
    expect(result.debugRows).toHaveLength(1);
    expect(result.debugRows[0].term_id).toBe("3");
  });

  it("joins multiple content items into one snippet for judgment", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "20",
        query: "Does framesdirect.com offer free shipping?",
        country: "US",
        language: "en",
        domain: "framesdirect.com",
        term_id: "164",
        term_name: "Frames Direct",
        subclass: "shipping",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "抓取完成",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        google_url: "https://www.google.com/search?q=framesdirect+shipping",
        content: [
          "Frames Direct offers free shipping in the US.",
          "Some oversized items may be excluded.",
        ],
        product_urls: ["https://www.framesdirect.com/shipping-policy"],
        updated_time: "2026-04-08 05:38:52",
      },
    ]);

    expect(result.totalRows).toBe(1);
    expect(result.debugRows[0].final_supported).toBe("yes");
    expect(result.debugRows[0].final_snippet).toContain("Frames Direct offers free shipping");
  });

  it("extracts percent values from confirmed positive discount snippets", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "20a",
        query: "Does appx.com offer app discounts?",
        country: "US",
        language: "en",
        domain: "appx.com",
        term_id: "1640",
        term_name: "App X",
        subclass: "app",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: [
          "App X offers an app-exclusive 15% discount for first purchases made in the official app.",
        ],
        product_urls: ["https://www.appx.com/app"],
      },
      {
        task_id: "20a",
        query: "Does appx.com offer app discounts?",
        country: "US",
        language: "en",
        domain: "appx.com",
        term_id: "1640",
        term_name: "App X",
        subclass: "app",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "search_lab",
        content: [
          "Download the app to get 15% off your first order.",
        ],
        product_urls: ["https://www.appx.com/mobile-benefits"],
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
    expect(result.debugRows[0].final_value).toBe("15%");
  });

  it("extracts fixed currency amounts from confirmed positive snippets", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "20b",
        query: "Does shopcash.com offer referral discounts?",
        country: "US",
        language: "en",
        domain: "shopcash.com",
        term_id: "1641",
        term_name: "Shop Cash",
        subclass: "referral",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: [
          "Refer a friend and get $10 off your next order once they complete a purchase.",
        ],
        product_urls: ["https://www.shopcash.com/refer-a-friend"],
      },
      {
        task_id: "20b",
        query: "Does shopcash.com offer referral discounts?",
        country: "US",
        language: "en",
        domain: "shopcash.com",
        term_id: "1641",
        term_name: "Shop Cash",
        subclass: "referral",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "search_lab",
        content: [
          "The referral program gives existing customers a $10 credit for each successful referral.",
        ],
        product_urls: ["https://www.shopcash.com/referral-program"],
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("yes");
    expect(result.debugRows[0].final_value).toBe("10 USD");
  });

  it("keeps final_value empty when the snippet is negative even if it mentions numbers", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "20c",
        query: "Does plainshop.com offer app discounts?",
        country: "US",
        language: "en",
        domain: "plainshop.com",
        term_id: "1642",
        term_name: "Plain Shop",
        subclass: "app",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: [
          "Plain Shop does not offer an app-exclusive discount. The site currently advertises a general 20% spring sale on the website.",
        ],
        product_urls: ["https://www.plainshop.com/app"],
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
    expect(result.debugRows[0].final_value).toBe("");
  });

  it("does not extract a newsletter value from generic discount mentions when sign-up benefit is unconfirmed", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "20d",
        query: "Does libristo.com offer newsletter discounts?",
        country: "DE",
        language: "de",
        domain: "libristo.com",
        term_id: "1643",
        term_name: "Libristo",
        subclass: "newsletter/first order/sign up/",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: [
          "Es gibt keinen verifizierten Hinweis auf einen 10% Newsletter-Rabatt. Andere allgemeine Rabattcodes werden zwar online gelistet, ein standardisierter Begrüßungsrabatt ist jedoch nicht bestätigt.",
        ],
        product_urls: ["https://www.libristo.com"],
      },
    ]);

    expect(result.debugRows[0].final_value).toBe("");
  });

  it("does not extract first responder value from alternative-retailer examples", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "20h",
        query: "Does petmeds.com offer first responder discounts?",
        country: "US",
        language: "en",
        domain: "1800petmeds.com",
        term_id: "1647",
        term_name: "1-800-PetMeds",
        subclass: "first responder",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: [
          "1-800-PetMeds does not offer a dedicated first responder discount at this time. If you are specifically looking for a first responder discount, other retailers in the pet industry provide verified programs, including 10% discounts elsewhere.",
        ],
        product_urls: ["https://www.1800petmeds.com"],
      },
    ]);

    expect(result.debugRows[0].final_value).toBe("");
  });

  it("keeps first responder no when the lead sentence says there is no indication and later text lists other retailers", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "20i",
        query: "Does soctopus.co.uk offer first responder discounts?",
        country: "UK",
        language: "en",
        domain: "soctopus.co.uk",
        term_id: "1650",
        term_name: "SOCTOPUS",
        subclass: "first responder",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: [
          "There is currently no indication that Soctopus offers a dedicated first responder discount. Their official website does not list specific discounts for emergency services.",
          "Other retailers and alternative sock brands may offer verified first responder discounts through third-party programs.",
        ],
        product_urls: ["https://www.soctopus.co.uk"],
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
    expect(result.debugRows[0].final_matched_rule).toMatch(/generic_negative|cross_entity_negative/);
  });

  it("keeps blue light card no when the official site does not list it and later text only mentions another retailer", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "20j",
        query: "Does sheetmaterialswholesale.co.uk offer blue light card discounts?",
        country: "UK",
        language: "en",
        domain: "sheetmaterialswholesale.co.uk",
        term_id: "1651",
        term_name: "Sheet Materials Wholesale",
        subclass: "blue light card",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: [
          "Based on the available information, there is no indication that Sheet Materials Wholesale offers a specific Blue Light Card discount. The official website FAQ does not list Blue Light Card or emergency services discounts.",
          "Other DIY retailers may offer Blue Light Card savings.",
        ],
        product_urls: ["https://www.sheetmaterialswholesale.co.uk"],
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("no");
    expect(result.debugRows[0].final_matched_rule).toMatch(/generic_negative|cross_entity_negative/);
  });

  it("does not extract return fee percentages as discount values", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "20e",
        query: "Does letslighting.com offer return benefits?",
        country: "DE",
        language: "de",
        domain: "letslighting.com",
        term_id: "1644",
        term_name: "Letslighting",
        subclass: "return",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: [
          "Kosten entstehen, wenn der Rückversand auf Käuferprobleme zurückzuführen ist. In solchen Fällen müssen Käufer eine Wiedereinlagerungsgebühr von 10% des Produktpreises tragen.",
        ],
        product_urls: ["https://www.letslighting.com/refund-policy"],
      },
    ]);

    expect(result.debugRows[0].final_value).toBe("");
  });

  it("does not extract unrelated secure payment percentages for price guarantee", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "20f",
        query: "Does example.com offer price guarantees?",
        country: "DE",
        language: "de",
        domain: "example.com",
        term_id: "1645",
        term_name: "Example",
        subclass: "price guarantee",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: [
          "Es handelt sich um ein Familien-Special mit Preisgarantie ohne Zusatzkosten. Die Zahlung ist zu 100% sicher.",
        ],
        product_urls: ["https://www.example.com/family-special"],
      },
    ]);

    expect(result.debugRows[0].final_value).toBe("");
  });

  it("does not extract birthday values from welcome discounts when the birthday perk has no numeric value", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "20g-birthday",
        query: "Does linzi.com offer birthday discounts?",
        country: "UK",
        language: "en",
        domain: "linzi.com",
        term_id: "1646",
        term_name: "Linzi",
        subclass: "birthday",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: [
          "Linzi Rewards members receive birthday treats and bonus points during their birthday month. New email subscribers can get 10% off their first order with a welcome code.",
        ],
        product_urls: ["https://www.linzi.com/pages/rewards"],
      },
    ]);

    expect(result.debugRows[0].final_value).toBe("");
  });

  it("does not extract family values from general member discounts", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "20g-family",
        query: "Does fc-fanshop.de offer family discounts?",
        country: "DE",
        language: "de",
        domain: "fc-fanshop.de",
        term_id: "1646a",
        term_name: "1. FC Koln Fanshop",
        subclass: "family",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: [
          "Der 1. FC Koln bietet keinen spezifischen, pauschalen Familienrabatt im Fanshop an. Als registriertes Mitglied erhalt man jedoch dauerhaft 10% Rabatt auf viele Fanartikel.",
        ],
        product_urls: ["https://fc-fanshop.de/"],
      },
    ]);

    expect(result.debugRows[0].final_value).toBe("");
  });

  it("does not extract unrelated senior values when the snippet says no senior discount exists", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "20g-senior-no",
        query: "Does linksys.com offer senior discounts?",
        country: "US",
        language: "en",
        domain: "linksys.com",
        term_id: "1646b",
        term_name: "Linksys",
        subclass: "senior",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: [
          "Linksys does not offer a public senior discount. Some third-party recycle programs mention 15% off at Best Buy, but that is unrelated to Linksys senior pricing.",
        ],
        product_urls: ["https://www.linksys.com/"],
      },
    ]);

    expect(result.debugRows[0].final_value).toBe("");
  });

  it("extracts senior percentage ranges when the range is the explicit benefit", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "20g-senior-range",
        query: "Does monument offer senior discounts?",
        country: "PL",
        language: "pl",
        domain: "monument.example",
        term_id: "1646c",
        term_name: "monument",
        subclass: "senior",
        bu: "hd",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: [
          "Senior customers receive a senior discount that typically ranges from 30-50% off ticket prices. Additional travel notes do not change the main senior discount range.",
        ],
        product_urls: ["https://www.monument.example/senior"],
      },
    ]);

    expect(result.debugRows[0].final_value).toBe("30%-50%");
  });

  it("parses JSON string arrays for content and product_urls in JSON uploads", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "21",
        query: "Does example.com offer free shipping?",
        country: "US",
        language: "en",
        domain: "example.com",
        term_id: "165",
        term_name: "Example",
        subclass: "shipping",
        [GG_COLLECTED_STATUS_COLUMN]: "抓取完成",
        [GG_COLLECTED_SOURCE_COLUMN]: "search_lab",
        content: '["Example offers free shipping on orders over $50.","Applies to domestic standard shipping."]',
        product_urls: '["https://www.example.com/shipping","https://www.google.com/search?q=example+shipping"]',
      },
      {
        task_id: "21",
        query: "Does example.com offer free shipping?",
        country: "US",
        language: "en",
        domain: "example.com",
        term_id: "165",
        term_name: "Example",
        subclass: "shipping",
        [GG_COLLECTED_STATUS_COLUMN]: "抓取完成",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: '["Free shipping is available once your cart reaches $50."]',
        product_urls: '["https://www.example.com/help/shipping-policy"]',
      },
    ]);

    expect(result.totalRows).toBe(2);
    expect(result.debugRows[0].final_supported).toBe("yes");
    expect(result.debugRows[0].final_snippet.toLowerCase()).toContain("free shipping");
    expect(result.debugRows[0].final_url).toContain("example.com");
    expect(result.debugRows[0].final_url).not.toContain("google.com");
  });

  it("decodes GB18030 CSV uploads without corrupting collected-table headers", () => {
    const csv = [
      `country,domain,term_id,term_name,subclass,${GG_COLLECTED_SOURCE_COLUMN},content,product_urls`,
      'US,shopa.com,1001,Shop A,shipping,ai_mode,"[""Shop A offers free shipping on orders over $50.""]","[""https://shopa.com/shipping""]"',
    ].join("\n");
    const fileBase64 = iconv.encode(csv, "gb18030").toString("base64");

    const preview = previewGgCleaningFile(
      { fileName: "fixture.csv", fileBase64 },
      { skipFileSizeLimit: true },
    );

    expect(preview.totalRows).toBe(1);
    expect(preview.groupedRows).toBe(1);
  });

  it("supports collected-table rows in JSONL uploads", () => {
    const rows = [
      {
        task_id: "22",
        query: "Does lakeland.co.uk offer app discounts?",
        country: "UK",
        language: "en",
        domain: "lakeland.co.uk",
        term_id: "166",
        term_name: "Lakeland",
        subclass: "app",
        [GG_COLLECTED_STATUS_COLUMN]: "抓取完成",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["By downloading the Lakeland App, users can access exclusive vouchers."],
        product_urls: ["https://www.lakeland.co.uk/app"],
      },
      {
        task_id: "22",
        query: "Does lakeland.co.uk offer app discounts?",
        country: "UK",
        language: "en",
        domain: "lakeland.co.uk",
        term_id: "166",
        term_name: "Lakeland",
        subclass: "app",
        [GG_COLLECTED_STATUS_COLUMN]: "抓取完成",
        [GG_COLLECTED_SOURCE_COLUMN]: "search_lab",
        content: ["The official mobile app includes app-only benefits and digital vouchers."],
        product_urls: ["https://www.lakeland.co.uk/mobile-app"],
      },
    ];

    const result = runEvalWithFile("fixture.jsonl", rows.map((row) => JSON.stringify(row)).join("\n"));

    expect(result.totalRows).toBe(2);
    expect(result.debugRows[0].final_supported).toBe("yes");
    expect(result.debugRows[0].final_url).toContain("lakeland.co.uk");
  });

  it("supports collected-table xlsx uploads with JSON-string arrays", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([
      {
        task_id: "23",
        query: "Does shopd.com offer free shipping?",
        country: "US",
        language: "en",
        domain: "shopd.com",
        term_id: "167",
        term_name: "Shop D",
        subclass: "shipping",
        [GG_COLLECTED_STATUS_COLUMN]: "抓取完成",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        google_url: "https://www.google.com/search?q=shopd+shipping",
        content: '["Shop D offers free shipping on orders over $30."]',
        product_urls: '["https://www.shopd.com/shipping-policy"]',
        updated_time: "2026-04-08 05:38:52",
      },
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

    const preview = previewGgCleaningFile({ fileName: "fixture.xlsx", fileBase64: buffer.toString("base64") }, { skipFileSizeLimit: true });
    const result = runEvalWithFile("fixture.xlsx", buffer);

    expect(preview.totalRows).toBe(1);
    expect(result.totalRows).toBe(1);
    expect(result.debugRows[0].final_supported).toBe("yes");
    expect(result.debugRows[0].final_url).toBe("https://www.shopd.com/shipping-policy");
  });

  it("prefers same-domain policy pages over off-domain coupon pages when selecting final_url", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "24",
        query: "Does premiumbags.com offer returns?",
        country: "UK",
        language: "en",
        domain: "premiumbags.com",
        term_id: "168",
        term_name: "Premium Bags",
        subclass: "return",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["Premium Bags offers a 30-day return policy for unused items."],
        product_urls: [
          "https://www.couponfollow.com/site/premiumbags.com",
          "https://www.premiumbags.com/help/returns-policy",
        ],
      },
      {
        task_id: "24",
        query: "Does premiumbags.com offer returns?",
        country: "UK",
        language: "en",
        domain: "premiumbags.com",
        term_id: "168",
        term_name: "Premium Bags",
        subclass: "return",
        [GG_COLLECTED_STATUS_COLUMN]: "鎶撳彇瀹屾垚",
        [GG_COLLECTED_SOURCE_COLUMN]: "search_lab",
        content: ["Returns are handled through the official returns policy page."],
        product_urls: ["https://www.premiumbags.com/returns"],
      },
    ]);

    expect(result.debugRows[0].final_url).toContain("premiumbags.com");
    expect(result.debugRows[0].final_url).not.toContain("couponfollow.com");
  });

  it("returns empty final_url when only off-domain coupon candidates exist for a targeted subclass", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "25",
        query: "Does 123-reg.co.uk offer clearance discounts?",
        country: "UK",
        language: "en",
        domain: "123-reg.co.uk",
        term_id: "169",
        term_name: "123 Reg",
        subclass: "clearance",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["123 Reg runs promotions from time to time, but no dedicated clearance page is confirmed here."],
        product_urls: [
          "https://www.groupon.co.uk/discount-codes/123-reg",
          "https://www.hotukdeals.com/vouchers/123-reg.co.uk",
          "https://www.vouchercloud.com/123-reg-vouchers",
        ],
      },
    ]);

    expect(result.debugRows[0].final_url).toBe("");
  });

  it("keeps app URL empty when only homepage and mismatched student pages exist", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "26",
        query: "Does stories.com offer app discounts?",
        country: "UK",
        language: "en",
        domain: "stories.com",
        term_id: "170",
        term_name: "& Other Stories",
        subclass: "app",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["Download the app to see available digital offers."],
        product_urls: [
          "https://www.stories.com/en-us/customer-service/student-discount/",
          "https://www.stories.com/en-us/",
        ],
      },
    ]);

    expect(result.debugRows[0].final_url).toBe("");
  });

  it("prefers official guarantee pages over generic offer pages for price guarantee", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "27",
        query: "Does 123-reg.co.uk offer a price guarantee?",
        country: "UK",
        language: "en",
        domain: "123-reg.co.uk",
        term_id: "171",
        term_name: "123 Reg",
        subclass: "price guarantee",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["123 Reg mentions a money-back guarantee on selected services."],
        product_urls: [
          "https://www.123-reg.co.uk/terms/domain-offers/",
          "https://www.123-reg.co.uk/terms/123-reg-money-back-guarantee",
        ],
      },
    ]);

    expect(result.debugRows[0].final_url).toBe("https://www.123-reg.co.uk/terms/123-reg-money-back-guarantee");
  });

  it("allows trusted partner pages for nhs when they are the clearest candidate", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "28",
        query: "Does 123-reg.co.uk offer nhs discounts?",
        country: "UK",
        language: "en",
        domain: "123-reg.co.uk",
        term_id: "172",
        term_name: "123 Reg",
        subclass: "nhs",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["An NHS discount may be available through a partner program."],
        product_urls: [
          "https://www.netvouchercodes.co.uk/help-and-faqs",
          "https://www.nhsdiscounts.org.uk/123-reg.co.uk",
        ],
      },
    ]);

    expect(result.debugRows[0].final_url).toBe("https://www.nhsdiscounts.org.uk/123-reg.co.uk");
  });

  it("prefers locale-matching official promotion pages over generic worldwide pages", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "29",
        query: "Does stories.com offer clearance discounts?",
        country: "UK",
        language: "en",
        domain: "stories.com",
        term_id: "173",
        term_name: "& Other Stories",
        subclass: "clearance",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["& Other Stories runs regular promotions and sale events."],
        product_urls: [
          "https://www.stories.com/en-ww/promotions/",
          "https://www.stories.com/en-gb/promotions/",
        ],
      },
    ]);

    expect(result.debugRows[0].final_url).toBe("https://www.stories.com/en-gb/promotions/");
  });

  it("prefers official student discount pages over partner student pages when both exist", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "30",
        query: "Does stories.com offer student discounts?",
        country: "UK",
        language: "en",
        domain: "stories.com",
        term_id: "174",
        term_name: "& Other Stories",
        subclass: "student",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["Students can verify and redeem a discount on the official merchant site."],
        product_urls: [
          "https://www.studentbeans.com/student-discount/uk/other-stories",
          "https://www.stories.com/en-ww/customer-service/student-discount/",
        ],
      },
    ]);

    expect(result.debugRows[0].final_url).toBe("https://www.stories.com/en-ww/customer-service/student-discount/");
  });

  it("supports app store URLs for app subclass when no better official app page exists", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "31",
        query: "Does 247blinds.co.uk offer app discounts?",
        country: "UK",
        language: "en",
        domain: "247blinds.co.uk",
        term_id: "175",
        term_name: "247blinds",
        subclass: "app",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["The merchant has a control app but no better official app landing page is listed here."],
        product_urls: [
          "https://www.studentbeans.com/student-discount/uk/247-blinds",
          "https://play.google.com/store/apps/details?id=com.youhone.control247",
        ],
      },
    ]);

    expect(result.debugRows[0].final_url).toBe("https://play.google.com/store/apps/details?id=com.youhone.control247");
  });

  it("keeps app URL empty when only generic homepage and support pages exist", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "31a",
        query: "Does 2gosoftware.co.uk offer app discounts?",
        country: "UK",
        language: "en",
        domain: "2gosoftware.co.uk",
        term_id: "175a",
        term_name: "2GO Software",
        subclass: "app",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["No candidate URL is clearly app specific for this merchant."],
        product_urls: [
          "https://2gosoftware.co.uk/",
          "https://2gosoftware.co.uk/contact",
        ],
      },
    ]);

    expect(result.debugRows[0].final_url).toBe("");
  });

  it("prefers UK locale play store URLs after decoding escaped query separators", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "31b",
        query: "Does 360play.co.uk offer app discounts?",
        country: "UK",
        language: "en",
        domain: "360play.co.uk",
        term_id: "175b",
        term_name: "360 Play",
        subclass: "app",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["The merchant app is available on Google Play."],
        product_urls: [
          "https://play.google.com/store/apps/details?id\\u003dcom.promo360.promo360\\u0026hl\\u003den_IN",
          "https://play.google.com/store/apps/details?id\\u003dcom.promo360.promo360\\u0026hl\\u003den_GB",
        ],
      },
    ]);

    expect(result.debugRows[0].final_url).toBe("https://play.google.com/store/apps/details?id=com.promo360.promo360&hl=en_GB");
  });

  it("prefers clearance voucher pages on the official domain", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "31c",
        query: "Does 123-reg.co.uk offer clearance or sale offers?",
        country: "UK",
        language: "en",
        domain: "123-reg.co.uk",
        term_id: "175c",
        term_name: "123 Reg",
        subclass: "clearance",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["123 Reg runs sales and voucher code promotions."],
        product_urls: [
          "https://www.groupon.co.uk/discount-codes/123-reg",
          "https://www.123-reg.co.uk/voucher-codes/",
          "https://www.123-reg.co.uk/terms/domain-offers/",
        ],
      },
    ]);

    expect(result.debugRows[0].final_url).toBe("https://www.123-reg.co.uk/voucher-codes/");
  });

  it("prefers loyalty offer pages over referral pages", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "31d",
        query: "Does 123-reg.co.uk offer a loyalty program?",
        country: "UK",
        language: "en",
        domain: "123-reg.co.uk",
        term_id: "175d",
        term_name: "123 Reg",
        subclass: "loyalty program",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["Existing domain customers can qualify for a loyalty offer."],
        product_urls: [
          "https://www.123-reg.co.uk/blog/refer-a-friend/",
          "https://www.123-reg.co.uk/terms/uk-domain-loyalty-offer/",
        ],
      },
    ]);

    expect(result.debugRows[0].final_url).toBe("https://www.123-reg.co.uk/terms/uk-domain-loyalty-offer/");
  });

  it("prefers teacher partner pages over on-domain student pages", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "31e",
        query: "Does stories.com offer teacher discounts?",
        country: "UK",
        language: "en",
        domain: "stories.com",
        term_id: "175e",
        term_name: "& Other Stories",
        subclass: "teacher",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["Teachers can redeem an offer through a partner verification platform."],
        product_urls: [
          "https://www.stories.com/en-gb/customer-service/student-discount/",
          "https://www.myunidays.com/GB/en-GB/partners/otherstories/view",
        ],
      },
    ]);

    expect(result.debugRows[0].final_url).toBe("https://www.myunidays.com/GB/en-GB/partners/otherstories/view");
  });

  it("does not use money-back guarantee pages as return URLs without return terms", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "31f",
        query: "Does 123-reg.co.uk offer free return?",
        country: "UK",
        language: "en",
        domain: "123-reg.co.uk",
        term_id: "175f",
        term_name: "123 Reg",
        subclass: "return",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["No clear free return page is available here."],
        product_urls: [
          "https://www.123-reg.co.uk/terms/123-reg-money-back-guarantee/",
        ],
      },
    ]);

    expect(result.debugRows[0].final_url).toBe("");
  });

  it("extracts shipping thresholds when the currency symbol follows the amount", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "31g",
        query: "Does leuchtentotal.de offer free shipping?",
        country: "DE",
        language: "de",
        domain: "leuchtentotal.de",
        term_id: "175g",
        term_name: "LeuchtenTotal",
        subclass: "shipping",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["Ja, bei LeuchtenTotal gibt es kostenlosen Versand innerhalb Deutschlands ab einem Bestellwert von 99 €."],
        product_urls: ["https://www.leuchtentotal.de/versand"],
      },
      {
        task_id: "31g-2",
        query: "Does leuchtentotal.de offer free shipping?",
        country: "DE",
        language: "de",
        domain: "leuchtentotal.de",
        term_id: "175g",
        term_name: "LeuchtenTotal",
        subclass: "shipping",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "search_lab",
        content: ["Kostenloser Versand gilt in Deutschland ab einem Warenwert von 99."],
        product_urls: ["https://www.leuchtentotal.de/versand"],
      },
    ]);

    expect(result.debugRows[0].final_value).toBe("min_free_shipping: 99 EUR");
  });

  it("normalizes comma-decimal shipping thresholds instead of inflating them by 100x", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "31g-decimal",
        query: "Does lightstock.de offer free shipping?",
        country: "DE",
        language: "de",
        domain: "lightstock.de",
        term_id: "175g-decimal",
        term_name: "Lightstock",
        subclass: "shipping",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["Innerhalb Deutschlands ist die Lieferung ab einem Bestellwert von 99,00 EUR versandkostenfrei."],
        product_urls: ["https://lightstock.de/versand"],
      },
    ]);

    expect(result.debugRows[0].final_value).toBe("min_free_shipping: 99 EUR");
  });

  it("extracts referral amounts with symbol-first currency values", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "31h",
        query: "Does maccosmetics.co.uk offer referral discounts?",
        country: "UK",
        language: "en",
        domain: "maccosmetics.co.uk",
        term_id: "175h",
        term_name: "MAC Cosmetics",
        subclass: "referral",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["Referral program offers $10 discount to both the referrer and the friend after a qualifying purchase."],
        product_urls: ["https://www.maccosmetics.co.uk/refer-a-friend"],
      },
    ]);

    expect(result.debugRows[0].final_value).toBe("10 USD");
  });

  it("extracts employee percentages from explicit discount sentences", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "31i",
        query: "Does lampify.de offer employee discounts?",
        country: "DE",
        language: "de",
        domain: "lampify.de",
        term_id: "175i",
        term_name: "Lampify",
        subclass: "employee",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["Ja, lampen-led-shop.de bietet spezielle Mitarbeiterrabatte an. Über dieses Programm können Teams dauerhaft 15 % Rabatt auf das gesamte Sortiment erhalten."],
        product_urls: ["https://www.lampify.de/mitarbeiterrabatt"],
      },
      {
        task_id: "31i-2",
        query: "Does lampify.de offer employee discounts?",
        country: "DE",
        language: "de",
        domain: "lampify.de",
        term_id: "175i",
        term_name: "Lampify",
        subclass: "employee",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "search_lab",
        content: ["Mitarbeiter erhalten 15 % Rabatt, wenn sie sich mit ihrer Unternehmens-E-Mail registrieren."],
        product_urls: ["https://www.lampify.de/mitarbeiterrabatt"],
      },
    ]);

    expect(result.debugRows[0].final_value).toBe("15%");
  });

  it("skips approximate newsletter ranges instead of forcing a single amount", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "31j",
        query: "Does refurbed.pl offer newsletter discounts?",
        country: "PL",
        language: "pl",
        domain: "refurbed.pl",
        term_id: "175j",
        term_name: "Refurbed",
        subclass: "newsletter/first order/sign up/",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["Refurbed zazwyczaj oferuje zniżkę, często około 10-20 PLN lub 5-10 EUR za zapis do newslettera."],
        product_urls: [],
      },
    ]);

    expect(result.debugRows[0].final_value).toBe("");
  });

  it("does not keep a final value when the merged supported label is unknown", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "31k-1",
        query: "Does magellans.com offer military discounts?",
        country: "US",
        language: "en",
        domain: "magellans.com",
        term_id: "175k",
        term_name: "Magellan's",
        subclass: "military",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["Magellan's does not currently offer a dedicated military discount, though newsletter discounts of 10-15% may be available for new customers."],
        product_urls: [],
      },
      {
        task_id: "31k-2",
        query: "Does magellans.com offer military discounts?",
        country: "US",
        language: "en",
        domain: "magellans.com",
        term_id: "175k",
        term_name: "Magellan's",
        subclass: "military",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "search_lab",
        content: ["Military discount availability remains unclear from the available information."],
        product_urls: [],
      },
    ]);

    expect(result.debugRows[0].final_supported).toBe("unknown");
    expect(result.debugRows[0].final_value).toBe("");
  });

  it("does not select family product bundle pages as final_url without a true family hint page", () => {
    const result = runEvalWithCollectedRows([
      {
        task_id: "31l",
        query: "Does mybacs.com offer family discounts?",
        country: "DE",
        language: "de",
        domain: "mybacs.com",
        term_id: "175l",
        term_name: "mybacs",
        subclass: "family",
        [GG_COLLECTED_STATUS_COLUMN]: "done",
        [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
        content: ["No explicit family discount page is listed here."],
        product_urls: ["https://mybacs.com/products/bundle-dailybacs-kids-family"],
      },
    ]);

    expect(result.debugRows[0].final_url).toBe("");
  });

  it("includes chunk metadata in grouped upload previews", async () => {
    const preview = await previewGgCleaningChunkRows({
      columns: ["country", "domain", "term_id", "term_name", "subclass", GG_COLLECTED_SOURCE_COLUMN, "content", "product_urls"],
      sampleRawRows: [
        {
          country: "US",
          domain: "shopa.com",
          term_id: "201",
          term_name: "Shop A",
          subclass: "shipping",
          [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
          content: ["Shop A offers free shipping on orders over $50."],
          product_urls: ["https://shopa.com/shipping"],
        },
      ],
      totalRows: 2,
      groupedRows: 1,
      chunkCount: 1,
      oversizedGroupCount: 0,
    });

    expect(preview.totalRows).toBe(2);
    expect(preview.groupedRows).toBe(1);
    expect(preview.chunkCount).toBe(1);
  });

  it("executes grouped chunk uploads with the same final aggregation output", async () => {
    const result = await executeGgCleaningChunkRows({
      rawRowChunks: (async function* () {
        yield [
          {
            task_id: "301",
            country: "US",
            domain: "shopa.com",
            term_id: "301",
            term_name: "Shop A",
            subclass: "shipping",
            [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
            content: ["Shop A offers free shipping on orders over $50 in the US."],
            product_urls: ["https://shopa.com/help/shipping-policy"],
          },
          {
            task_id: "302",
            country: "US",
            domain: "shopb.com",
            term_id: "302",
            term_name: "Shop B",
            subclass: "app",
            [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
            content: ["Shop B offers an app-exclusive 10% discount."],
            product_urls: ["https://shopb.com/app"],
          },
        ];
        yield [
          {
            task_id: "301",
            country: "US",
            domain: "shopa.com",
            term_id: "301",
            term_name: "Shop A",
            subclass: "shipping",
            [GG_COLLECTED_SOURCE_COLUMN]: "search_lab",
            content: ["Shipping policy: free delivery for orders over $50."],
            product_urls: ["https://shopa.com/shipping"],
          },
        ];
      })(),
      columns: ["country", "domain", "term_id", "term_name", "subclass", GG_COLLECTED_SOURCE_COLUMN, "content", "product_urls"],
      sampleRawRows: [
        {
          country: "US",
          domain: "shopa.com",
          term_id: "301",
          term_name: "Shop A",
          subclass: "shipping",
          [GG_COLLECTED_SOURCE_COLUMN]: "ai_mode",
          content: ["Shop A offers free shipping on orders over $50 in the US."],
          product_urls: ["https://shopa.com/help/shipping-policy"],
        },
      ],
      totalRows: 3,
      groupedRows: 2,
      chunkCount: 2,
      oversizedGroupCount: 0,
    });

    expect(result.summary.chunkCount).toBe(2);
    expect(result.debugRows).toHaveLength(2);
    expect(result.debugRows.find((row) => row.term_id === "301")?.final_supported).toBe("yes");
    expect(result.debugRows.find((row) => row.term_id === "302")?.final_supported).toBe("yes");
  });
});
