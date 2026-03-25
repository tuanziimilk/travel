import "dotenv/config";
import { faqOutputSubclasses } from "../src/skills/skillRouter";
import { ensureSkillVersionBootstrap } from "../src/skills/skillVersionService";

async function main() {
  const seeds = [
    { capability: "quality" as const, scType: "about" as const, subclass: "", targetType: "module_live" as const },
    { capability: "quality" as const, scType: "faq" as const, subclass: "", targetType: "module_live" as const },
    { capability: "generation" as const, scType: "faq" as const, subclass: "", targetType: "route_override" as const },
    ...faqOutputSubclasses.map((subclass) => ({
      capability: "generation" as const,
      scType: "faq" as const,
      subclass,
      targetType: "route_override" as const,
    })),
  ];

  let created = 0;
  for (const seed of seeds) {
    const row = await ensureSkillVersionBootstrap(seed);
    if (row?.actionType === "bootstrap") created += 1;
  }
  console.log(`[bootstrap-skill-history] processed=${seeds.length} created=${created}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[bootstrap-skill-history] failed", error);
    process.exit(1);
  });
