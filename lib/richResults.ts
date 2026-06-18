// RichResultValidator — lightweight, extensible validation of detected schemas against
// common Google Rich Result expectations. Not a full schema.org validator; it checks for
// the presence of required/recommended properties per type.
//
// EXTENSIBILITY: to support a new schema type, add one entry to RULES. Nothing else changes.

import type { DetectedSchema } from "./jsonld";

export type SchemaRule = {
  required: string[];
  recommended: string[];
};

export const RULES: Record<string, SchemaRule> = {
  Article: {
    required: ["headline"],
    recommended: ["image", "author", "datePublished"],
  },
  // NewsArticle/BlogPosting are Article subtypes; share Article expectations.
  NewsArticle: {
    required: ["headline"],
    recommended: ["image", "author", "datePublished"],
  },
  BlogPosting: {
    required: ["headline"],
    recommended: ["image", "author", "datePublished"],
  },
  BreadcrumbList: {
    required: ["itemListElement"],
    recommended: [],
  },
  FAQPage: {
    required: ["mainEntity"],
    recommended: [],
  },
  Product: {
    required: ["name"],
    recommended: ["offers", "image", "review", "aggregateRating"],
  },
  VideoObject: {
    required: ["name", "uploadDate"],
    recommended: ["thumbnailUrl", "description"],
  },
  Event: {
    required: ["name", "startDate", "location"],
    recommended: ["endDate", "offers", "image"],
  },
  Course: {
    required: ["name", "description"],
    recommended: ["provider"],
  },
  Organization: {
    required: ["name"],
    recommended: ["logo", "url"],
  },
  WebSite: {
    required: ["name"],
    recommended: ["url", "potentialAction"],
  },
  Person: {
    required: ["name"],
    recommended: ["url", "image"],
  },
};

export type Check = { property: string; message: string };

export type ValidationResult = {
  /** Primary @type this result was validated against. */
  schemaType: string;
  /** All @type values present on the node. */
  schemaTypes: string[];
  /** True when no rule exists for any of the node's types. */
  unknown: boolean;
  errors: Check[];
  warnings: Check[];
  passed: Check[];
};

/** Returns true if the schema node has a meaningful (non-empty) value for `prop`. */
function hasProp(node: Record<string, unknown>, prop: string): boolean {
  if (!(prop in node)) return false;
  const v = node[prop];
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** Pick the first of the node's types that has a rule, else the first type. */
function pickRuleType(types: string[]): { type: string; rule: SchemaRule | null } {
  for (const t of types) {
    if (RULES[t]) return { type: t, rule: RULES[t] };
  }
  return { type: types[0] ?? "Unknown", rule: null };
}

export function validateSchema(schema: DetectedSchema): ValidationResult {
  const { type, rule } = pickRuleType(schema.types);
  const errors: Check[] = [];
  const warnings: Check[] = [];
  const passed: Check[] = [];

  if (!rule) {
    return {
      schemaType: type,
      schemaTypes: schema.types,
      unknown: true,
      errors,
      warnings,
      passed,
    };
  }

  for (const prop of rule.required) {
    if (hasProp(schema.node, prop)) {
      passed.push({ property: prop, message: `${prop} present` });
    } else {
      errors.push({ property: prop, message: `${prop} is required` });
    }
  }
  for (const prop of rule.recommended) {
    if (hasProp(schema.node, prop)) {
      passed.push({ property: prop, message: `${prop} present` });
    } else {
      warnings.push({ property: prop, message: `${prop} is recommended` });
    }
  }

  return {
    schemaType: type,
    schemaTypes: schema.types,
    unknown: false,
    errors,
    warnings,
    passed,
  };
}

/** Validate a list of schemas; unknown-type schemas are included but flagged. */
export function validateSchemas(schemas: DetectedSchema[]): ValidationResult[] {
  return schemas.map(validateSchema);
}
