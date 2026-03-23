import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFallbackQuestion, finalizeGenerationItem, normalizeCountryCode, validateGenerationCandidate } from "./faqOutputGenerator";
import { skillRegistry } from "../skills/skillRegistry";
import { resolveSkillRoot } from "../skills/skillPath";
import { faqOutputSubclasses, normalizeFaqSubclassFromFactType, resolveSkillRoute } from "../skills/skillRouter";

const boardField = "板块名称";

function toSkillDir(subclass: string) {
  return resolveSkillRoot(`skills/faq-output-${subclass.replaceAll("/", "-").replace(/\s+/g, "-")}`);
}

describe("faq output routing", () => {
  it("maps student_discount to student subclass", () => {
    expect(normalizeFaqSubclassFromFactType("student_discount")).toBe("student");
  });

  it("keeps plain student as student subclass", () => {
    expect(normalizeFaqSubclassFromFactType("student")).toBe("student");
  });

  it("maps aliased fact types with normalized casing", () => {
    expect(normalizeFaqSubclassFromFactType(" Student Discount ")).toBe("student");
  });

  it("activates all 23 faq output subclass routes", () => {
    for (const subclass of faqOutputSubclasses) {
      const route = resolveSkillRoute({
        capability: "generation",
        scType: "faq",
        subclass,
      });
      expect(route.status, subclass).toBe("active");
      expect(route.skillKey, subclass).toContain(`faq-output-${subclass.replaceAll("/", "-").replace(/\s+/g, "-")}`);
    }
  });
});

describe("faq output generation candidate validation", () => {
  it("accepts a valid student JSON payload with Titile1", () => {
    const candidate = JSON.stringify({
      ContentType: "faq",
      Country: "US",
      TermID: "123",
      TermName: "Example Brand",
      Domain: "example.com",
      Source: "AI",
      Subclass: "student",
      [boardField]: "faq",
      Titile1: "Does Example Brand offer a student discount?",
      "Brief Introduction": "Yes. Example Brand offers students 10% off after verification.",
      "Href Kw": "",
      "Href Url": "",
    });

    const result = validateGenerationCandidate(candidate, "student");
    expect(result.ok).toBe(true);
  });

  it("accepts legacy Title1 and normalizes it into Titile1", () => {
    const candidate = JSON.stringify({
      ContentType: "faq",
      Country: "UK",
      TermID: "456",
      TermName: "Demo Shop",
      Domain: "demo.example",
      Source: "AI",
      Subclass: "student",
      [boardField]: "faq",
      Title1: "Does Demo Shop have a student discount?",
      "Brief Introduction": "No. Demo Shop does not clearly advertise a standard student discount.",
      "Href Kw": "",
      "Href Url": "",
    });

    const result = validateGenerationCandidate(candidate, "student");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value?.Titile1).toContain("Demo Shop");
    }
  });

  it("preserves template placeholders before export", () => {
    const candidate = JSON.stringify({
      ContentType: "faq",
      Country: "UK",
      TermID: "456",
      TermName: "",
      Domain: "argos.co.uk",
      Source: "AI",
      Subclass: "return",
      [boardField]: "faq",
      Titile1: "Does {Mer.} offer free returns?",
      "Brief Introduction": "No, [Brand] does not offer free returns by default.",
      "Href Kw": "{Brand} returns",
      "Href Url": "",
    });

    const result = validateGenerationCandidate(candidate, "return");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const finalized = finalizeGenerationItem(
        result.value!,
        {
          term_id: "456",
          country: "UK",
          domain: "argos.co.uk",
          term_name: "Argos",
          fact_type: "return_policy",
          supported: "yes",
          status: "active",
          discount_type: "",
          discount_value: "",
          currency: "",
          discount_details: "",
          url: "",
        },
        "return",
      );

      expect(finalized.Titile1).toBe("Does {Mer.} offer free returns?");
      expect(finalized["Brief Introduction"]).toContain("[Brand]");
      expect(finalized["Href Kw"]).toBe("{Brand} returns");
    }
  });

  it("rejects subclass mismatch", () => {
    const candidate = JSON.stringify({
      ContentType: "faq",
      Country: "US",
      TermID: "123",
      TermName: "Example Brand",
      Domain: "example.com",
      Source: "AI",
      Subclass: "gift card",
      [boardField]: "faq",
      Titile1: "Question",
      "Brief Introduction": "Answer",
      "Href Kw": "",
      "Href Url": "",
    });

    const result = validateGenerationCandidate(candidate, "student");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("Subclass mismatch");
    }
  });

  it("rejects malformed payloads that miss required output fields", () => {
    const candidate = JSON.stringify({
      ContentType: "faq",
      Country: "US",
      TermID: "123",
      TermName: "Example Brand",
      Domain: "example.com",
      Source: "AI",
      Subclass: "student",
      [boardField]: "faq",
      "Brief Introduction": "Answer only",
      "Href Kw": "",
      "Href Url": "",
    });

    const result = validateGenerationCandidate(candidate, "student");
    expect(result.ok).toBe(false);
  });
});

describe("faq output fallback helpers", () => {
  it("normalizes country codes to uppercase", () => {
    expect(normalizeCountryCode(" us ")).toBe("US");
    expect(normalizeCountryCode("Uk")).toBe("UK");
  });

  it("uses subclass-aware fallback titles for non-discount faq types", () => {
    expect(buildFallbackQuestion("WeatherTech", "shipping")).toBe("What shipping options does WeatherTech offer?");
    expect(buildFallbackQuestion("Argos", "return")).toBe("What is Argos's return policy?");
    expect(buildFallbackQuestion("Samsung", "blue light card")).toBe("Does Samsung offer a Blue Light Card discount?");
  });
});

describe("faq output skill bundle contract", () => {
  it("loads every faq skill with SKILL.md and output-format reference", async () => {
    for (const subclass of faqOutputSubclasses) {
      const dir = toSkillDir(subclass);
      expect(existsSync(join(dir, "SKILL.md")), subclass).toBe(true);
      expect(existsSync(join(dir, "references", "output-format.md")), subclass).toBe(true);

      const bundle = await skillRegistry.getSkill(dir);
      expect(bundle.skillMd.length, subclass).toBeGreaterThan(0);
      expect(bundle.references["output-format.md"], subclass).toContain("ContentType");
      expect(bundle.references["output-format.md"], subclass).toContain("TermID");
      expect(bundle.references["output-format.md"], subclass).toContain("Source");
      expect(bundle.references["output-format.md"], subclass).toContain("Subclass");
      expect(bundle.references["output-format.md"], subclass).toContain("Titile1");
      expect(bundle.references["output-format.md"], subclass).toContain("Brief Introduction");
    }
  });

  it("keeps every skill markdown free of broken output-format injection artifacts", async () => {
    for (const subclass of faqOutputSubclasses) {
      const bundle = await skillRegistry.getSkill(toSkillDir(subclass));
      expect(bundle.skillMd, subclass).not.toContain("eferences/output-format.md: unified FAQ output contract");
      expect(bundle.skillMd, subclass).not.toContain("\\references/output-format.md");
      expect(bundle.skillMd, subclass).not.toContain("```references/output-format.md");
    }
  });
});
