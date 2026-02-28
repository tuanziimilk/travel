import { scoreAboutByAiWithMeta } from "./src/scoring/aboutAiScorer";

const input = {
  TermID: "225262",
  TermName: "Elite Pro Sports",
  Domain: "eliteprosports.co.uk",
  Country: "UK",
  About_online: `Yorkshire-based {Mer.} is an online sports shop with a focus on distribution, e-commerce, and sports franchises. The team at {Mer.} has developed core product categories such performance sports apparel and protection gear using their revolutionary vision and technology viewpoint. They have over 30 years of experience in production, retail, and e-commerce in the sporting goods business. Almost all sports demand certain equipment. Even jogging, which is arguably the most basic of all activities, calls for a pair of shoes that are cozy and supportive for the majority of people. In light of this, owning a franchise that focuses on standard apparel and equipment for athletic activities has significant potential. The sporting goods market as a whole is enormous.`,
  About_ai: `{Mer.} is a Yorkshire-based online sports retailer and manufacturer specialising in apparel for professional sports clubs, including rugby, football and netball. Based in Doncaster, South Yorkshire, {Mer.} owns the OXEN Sports brand and supplies technical kits, fan apparel and teamwear for a range of sporting disciplines. Services include kit manufacturing, e-commerce operations, warehousing, distribution - and fulfilment, along with online store management for partner clubs and organisations. With over 30 years of experience in production, retail and e-commerce, {Mer.} focuses on providing a consistent range of sports clothing and equipment that supports team identity and fan engagement across the UK.`,
  About_op: ""
};

const result = await scoreAboutByAiWithMeta(input);
console.log(JSON.stringify(result, null, 2));
