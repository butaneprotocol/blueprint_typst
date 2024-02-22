import * as fs from "fs";

type Pointer = {
  $ref: string;
};

const genericLetters = "abcdefg".split("");

const plutusData: { title: "Data"; description: "Any Plutus data." } = {
  title: "Data",
  description: "Any Plutus data.",
};

type Definition =
  | ({ title?: string; description?: string } & (
      | // Pointer
      {
          schema: Pointer;
        }
      // Variants (Product)
      | {
          anyOf: Variants;
        }
      // Record (Sum)
      | {
          dataType: "constructor";
          index: number;
          fields: { $ref: string; title?: string }[];
        }
      // List
      | {
          dataType: "list";
          items: Pointer;
        }
      // Dictionary
      | {
          dataType: "map";
          keys?: Pointer;
          values?: Pointer;
        }
      // Raw bytes
      | {
          dataType: "bytes";
        }
      // Raw integer
      | {
          dataType: "integer";
        }
    ))
  | typeof plutusData;

type Variants = Definition[];

type Blueprint = {
  preamble: {
    title: string;
    description?: string;
    version?: string;
    plutusVersion?: string;
    license?: string;
  };
  validators: {
    title: string;
    datum?: Definition;
    redeemer: Definition;
    parameters?: Definition[];
    compiledCode: string;
    hash: string;
  }[];
  definitions: Record<string, Definition>;
};

const plutusJson: Blueprint = JSON.parse(
  fs.readFileSync("plutus.json", "utf8")
);

// Butane-Specific Changes
if (
  plutusJson.validators.find((x) => x.title == "synthetics.validate") !==
  undefined
) {
  plutusJson.validators.find((x) => x.title == 
"synthetics.validate")!.redeemer =
    plutusJson.validators.find((x) => x.title == 
"synthetics.types")!.redeemer;
  plutusJson.validators.find((x) => x.title == "state.spend")!.datum =
    plutusJson.validators.find((x) => x.title == 
"synthetics.types")!.datum;
  plutusJson.validators = plutusJson.validators.filter(
    (x) =>
      [
        "util.always_true",
        "util.types",
        "synthetics.types",
        "price_feed.feed_type",
        "price_feed.feed_inner_type",
      ].indexOf(x.title) == -1
  );
}

//

const definitions = plutusJson.definitions;

function getTypstRef(ref: string) {
  let res = ref;
  // Generic
  if (ref.includes("$")) {
    let [main] = ref.split("$");
    res = `${main}-a`;
  }
  return res.replaceAll("/", "-").replaceAll("_", "-").toLowerCase();
}

function renderRef(ref: string, generics?: string[], preprocess = true) {
  if (!ref) {
    return "";
  }
  let sliced;
  if (preprocess) {
    sliced = ref.slice("#/definitions/".length).replaceAll("~1", "/");
  } else {
    sliced = ref;
  }

  let links: string[] = [];

  let fixed = sliced.split("$");
  let almost: string;
  let almostLink: string;
  if (fixed.length == 1) {
    almost = fixed[0];
    almostLink = getTypstRef(almost);
  } else if (generics === undefined) {
    const numGenerics = fixed[1].split("_").length;
    almost = `${fixed[0]}\\<${genericLetters
      .slice(0, numGenerics)
      .join(", ")}\\>`;
    almostLink = getTypstRef(`${fixed[0]}-a`);
  } else {
    almost = fixed[0];
    links = fixed[1].split("_");
    almostLink = getTypstRef(`${fixed[0]}-a`);
  }
  const lastSlash = almost.lastIndexOf("/");
  if (lastSlash !== -1) {
    almost =
      almost.substring(0, lastSlash) + "." + almost.substring(lastSlash + 
1);
  }
  if (generics?.includes(almost)) {
    return genericLetters[generics.indexOf(almost)];
  }
  let linkStr = "";
  // console.log(`#link(<${getTypstRef(key)}>)[Click here]`)
  if (links.length > 0) {
    linkStr = links
      .map((link) => {
        // TODO: Properly handle recursive generic types
        if (link == "aiken/transaction/credential/Referenced") {
          link =
            
"aiken/transaction/credential/Referenced$aiken/transaction/credential/Credential";
        } else if (link == "butane/types/Feed") {
          link = "butane/types/Feed$butane/types/PriceFeed_ByteArray";
        }
        return renderRef(link, generics, false);
        // console.log(link)
      })
      .join(", ");
  }
  linkStr = linkStr.length > 0 ? `\\<${linkStr}\\>` : "";

  let almostStr = `#link(<${almostLink}>)[${almost}]`;
  if (["int", "bytearray", "data"].includes(almostLink)) {
    almostStr = almost;
  } else if (almostLink == "tuple") {
    almostStr = "(Int, Int)";
  }

  return `${almostStr}${linkStr}`;
}

function stringifyDefinitions(
  depth: number,
  definition: Definition,
  generics?: string[]
) {
  let out = "";
  if ("schema" in definition && definition.title) {
    //out += `${tabs}alias ${definition.title} = 
${definition.schema.$ref}\n`
    out += `${renderRef(definition.schema.$ref, generics)} \\ \n`;
  } else if ("anyOf" in definition) {
    out += `:= \\{ \\ \n#enum(indent: ${
      depth * 16
    }pt,numbering: (num)=>[#if num > 1 [|]],`;
    for (const def of definition.anyOf) {
      out += "[" + stringifyDefinitions(depth + 1, def, generics) + "],";
    }
    out = out.slice(0, -1);
    out += `)\n\\}\n`;
  } else if ("dataType" in definition && definition.dataType == 
"constructor") {
    if (!definition.fields[0]) {
      out += `${definition.title}`;
    } else if (definition.fields[0].title) {
      // Record
      out += `${definition.title} \\{\\`;
      for (const field of definition.fields) {
        out += ` #h(16pt) ${field.title} := ${renderRef(
          field.$ref,
          generics
        )}, \\`;
      }
      out += `\ \\}`;
    } else {
      // Enum
      out += `${definition.title}\(`;
      for (const field of definition.fields) {
        out += `${renderRef(field.$ref, generics)},`;
      }
      out = out.slice(0, -1);
      out += `\)#linebreak()`;
    }
  } else if ("dataType" in definition && definition.dataType == "list") {
    out += `\${x_n in $ ${renderRef(
      definition.items.$ref,
      generics
    )} $}_(n=0)^∞$\n`;
  } else if ("dataType" in definition && definition.dataType == "map") {
    out += `Map\\<${renderRef(
      definition.keys!.$ref,
      generics
    )} $arrow.r$ ${renderRef(definition.values!.$ref, generics)}\\>\n`;
  } else if ("dataType" in definition && definition.dataType == "bytes") {
    //out += `${tabs}raw bytes\n`
  } else if ("dataType" in definition && definition.dataType == "integer") 
{
    //out += `${tabs}an arbitrary sized integer\n`
  } else if (JSON.stringify(definition) === JSON.stringify(plutusData)) {
    //out += `${tabs}some raw plutus data\n`
  }
  return out;
}

function snakeToPascalCase(input: string): string {
  return input.split("_").reduce((result, word) => {
    return result + word.charAt(0).toUpperCase() + 
word.slice(1).toLowerCase();
  }, "");
}
console.log("#import sym");
console.log("#let blueprint_appendix = [");
console.log("== Validator Definitions");
{
  let pScripts = `#table(
    columns: (auto, auto),
    inset: 10pt,
    align: horizon,
    [*Validator Name*], [*Parameters*],
    `;
  for (const validator of plutusJson.validators) {
    const title = validator.title
      .split(".")
      .map(snakeToPascalCase)
      .join(" $arrow.r$ ");
    if (validator.parameters == undefined || validator.parameters.length 
== 0) {
      pScripts += `[${title}], [],`;
    } else {
      pScripts += `[${title}], [`;
      for (const parameter of validator.parameters) {
        const paramRef = renderRef(parameter.schema.$ref);
        pScripts += `\`${
          parameter.title.split(".").map(snakeToPascalCase) || ""
        }\`: ${paramRef},#linebreak()`;
      }
      pScripts += `],`;
    }
  }
  pScripts = pScripts.slice(0, -1);
  pScripts += ")";
  console.log(pScripts);
}

console.log("== Redeemers");
{
  let redeemersString = `#table(
  columns: (auto, auto),
  inset: 10pt,
  align: horizon,
  [*Validator Name*], [*Redeemer*],
  `;
  for (const validator of plutusJson.validators) {
    if (!("schema" in validator.redeemer)) {
      throw new Error("Redeemer must be a schema/ref");
    }
    if (validator.datum && !("schema" in validator.datum)) {
      throw new Error("Datum must be a schema/ref");
    }
    const title = validator.title
      .split(".")
      .map(snakeToPascalCase)
      .join(" $arrow.r$ ");
    const redeemerRef = renderRef(validator.redeemer.schema.$ref, [""]);
    redeemersString += `[${title}], [${redeemerRef}],`;
  }
  redeemersString = redeemersString.slice(0, -1);
  redeemersString += ")";
  console.log(redeemersString);
}
console.log("== Datums");
{
  let datumString = `#table(
  columns: (auto, auto),
  inset: 10pt,
  align: horizon,
  [*Validator Name*], [*Datum*],
  `;
  for (const validator of plutusJson.validators) {
    if (validator.datum && !("schema" in validator.datum)) {
      throw new Error("Datum must be a schema/ref");
    }
    const title = validator.title
      .split(".")
      .map(snakeToPascalCase)
      .join(" $arrow.r$ ");
    const datumRef = validator.datum?.schema.$ref
      ? renderRef(validator.datum?.schema.$ref, [""])
      : undefined;
    if (datumRef != undefined) {
      datumString += `[${title}], [${datumRef}],`;
    }
  }
  datumString = datumString.slice(0, -1);
  datumString += ")";
  console.log(datumString);
}
console.log(`== Definitions`);

const written = new Set();
for (const key of Object.keys(definitions)) {
  const def = definitions[key];

  const [keyNoGen, generics] = key.split("$");
  const genericsList = generics?.split("_");
  if (written.has(keyNoGen)) {
    continue;
  }
  const ret = stringifyDefinitions(1, def, genericsList ?? [""]);
  if (ret != "" && key) {
    console.log(
      `/ ${renderRef("#/definitions/" + key)} <${getTypstRef(key)}>: 
${ret}`
    );
    written.add(keyNoGen);
    // console.log(`#link(<${getTypstRef(key)}>)[Click here]`)
  }
}
console.log("]");

