// Viridis Land Package v1: validator for JavaScript (browsers and Node.js 19 or later).
// Mirrors land_package.py. Runs entirely where it is called; it sends nothing anywhere.
// Apache-2.0. https://github.com/viridisconservation/land-package

export const VERSION = "1.0";
export const CRS = "EPSG:4326";
export const SUBJECT_KINDS = ["property", "field", "woodlot", "landscape"];
export const LOCATION_PRECISION = ["exact", "generalized"];
export const CONSENT = ["holder", "covered", "none", "not_applicable"];
export const CLAIM_KINDS = ["measured", "modelled", "estimated", "derived", "stated"];
export const NOT_RETRIEVED_STATUS = ["failed", "defaulted", "estimated"];
export const GEOMETRY_TYPES = ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"];
export const UNRECORDED_SOURCE = "unrecorded";
const REQUIRED = ["land_package", "name", "created", "generator", "crs", "units", "subject", "privacy", "sources", "layers", "claims", "not_retrieved", "integrity"];
const OPTIONAL = ["receipt", "extensions"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";

// RFC 8785 canonical JSON. JSON.stringify already writes numbers and strings the required way;
// Array.prototype.sort on strings already orders by UTF-16 code units.
export function canonical(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("NaN and infinity cannot be written as JSON");
    const text = JSON.stringify(value);
    if (text === undefined) throw new Error("the value cannot be written as JSON");
    return text;
  }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
}

export async function contentSha256(pkg) {
  const body = {};
  for (const key of Object.keys(pkg)) if (key !== "integrity") body[key] = pkg[key];
  const bytes = new TextEncoder().encode(canonical(body));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function positionErrors(pos, where) {
  if (!Array.isArray(pos) || pos.length < 2 || !pos.slice(0, 3).every(isNumber)) return [`${where}: a position must be [longitude, latitude] numbers`];
  const [lon, lat] = pos;
  if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) return [`${where}: position ${lon}, ${lat} is outside longitude and latitude ranges (LP1)`];
  return [];
}

function lineErrors(coords, where, minimum, closed) {
  if (!Array.isArray(coords) || coords.length < minimum) return [`${where}: needs at least ${minimum} positions`];
  const errors = coords.flatMap((pos, i) => positionErrors(pos, `${where}[${i}]`));
  const first = coords[0], last = coords[coords.length - 1];
  if (closed && !errors.length && (first[0] !== last[0] || first[1] !== last[1])) errors.push(`${where}: ring is not closed (LP1)`);
  return errors;
}

export function geometryErrors(geometry, where) {
  if (!isObject(geometry)) return [`${where}: geometry is missing`];
  const { type, coordinates } = geometry;
  if (!GEOMETRY_TYPES.includes(type)) return [`${where}: geometry type ${JSON.stringify(type)} is not supported; it is not converted or dropped (LP7)`];
  if (type === "Point") return positionErrors(coordinates, where);
  if (type === "MultiPoint") return lineErrors(coordinates, where, 1, false);
  if (type === "LineString") return lineErrors(coordinates, where, 2, false);
  if (!Array.isArray(coordinates) || !coordinates.length) return [`${where}: coordinates are empty`];
  if (type === "MultiLineString") return coordinates.flatMap((line, i) => lineErrors(line, `${where}.line[${i}]`, 2, false));
  if (type === "Polygon") return coordinates.flatMap((ring, i) => lineErrors(ring, `${where}.ring[${i}]`, 4, true));
  return coordinates.flatMap((polygon, p) => !Array.isArray(polygon) || !polygon.length
    ? [`${where}.polygon[${p}]: coordinates are empty`]
    : polygon.flatMap((ring, i) => lineErrors(ring, `${where}.polygon[${p}].ring[${i}]`, 4, true)));
}

// Everything except the hash. Returns { errors, warnings }.
export function validateStructure(pkg) {
  const errors = [], warnings = [];
  if (!isObject(pkg)) return { errors: ["a Land Package is a JSON object"], warnings };
  for (const key of REQUIRED) if (!(key in pkg)) errors.push(`missing field: ${key}`);
  for (const key of Object.keys(pkg)) if (!REQUIRED.includes(key) && !OPTIONAL.includes(key)) errors.push(`unknown top-level field: ${key} (put tool-specific content under extensions)`);
  if (errors.length) return { errors, warnings };

  if (pkg.land_package !== VERSION) errors.push(`land_package must be "${VERSION}"`);
  if (!isText(pkg.name)) errors.push("name must be a non-empty string");
  if (typeof pkg.created !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(pkg.created)) errors.push("created must start with a date, YYYY-MM-DD");
  if (!(isObject(pkg.generator) && isText(pkg.generator.tool))) errors.push("generator.tool must name the tool that wrote the package");
  if (pkg.crs !== CRS) errors.push(`crs must be ${CRS} (LP1)`);
  const units = pkg.units;
  if (!(isObject(units) && Object.keys(units).length === 2 && units.length === "m" && units.area === "m2")) errors.push("units must be length m and area m2 (LP1)");

  const subject = pkg.subject;
  if (!isObject(subject) || !SUBJECT_KINDS.includes(subject.kind)) errors.push(`subject.kind must be one of ${SUBJECT_KINDS.join(", ")}`);
  else if (subject.area_m2 !== undefined && subject.area_m2 !== null && !(isNumber(subject.area_m2) && subject.area_m2 >= 0)) errors.push("subject.area_m2 must be a non-negative number or null");

  const privacy = pkg.privacy;
  if (!isObject(privacy)) errors.push("privacy must be an object (LP4)");
  else {
    if (!LOCATION_PRECISION.includes(privacy.location)) errors.push(`privacy.location must be one of ${LOCATION_PRECISION.join(", ")} (LP4)`);
    if (typeof privacy.personal_data !== "boolean") errors.push("privacy.personal_data must be true or false (LP4)");
    if (!CONSENT.includes(privacy.consent)) errors.push(`privacy.consent must be one of ${CONSENT.join(", ")} (LP4)`);
    if ("shareable" in privacy) errors.push("privacy.shareable is derived by the reader and must not be written (LP4)");
  }

  let sources = pkg.sources;
  if (!isObject(sources)) { errors.push("sources must be an object"); sources = {}; }
  for (const [id, record] of Object.entries(sources)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) errors.push(`source id ${JSON.stringify(id)} must use letters, digits, dot, dash or underscore`);
    if (!isObject(record) || !isText(record.title)) errors.push(`source ${JSON.stringify(id)} needs a title (LP2)`);
  }
  const known = (id) => typeof id === "string" && Object.prototype.hasOwnProperty.call(sources, id);

  let layers = pkg.layers;
  if (!isObject(layers)) { errors.push("layers must be an object"); layers = {}; }
  for (const [name, layer] of Object.entries(layers)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) errors.push(`layer name ${JSON.stringify(name)} must start with a letter and use letters, digits or underscore`);
    if (!isObject(layer) || !Array.isArray(layer.features) || !Array.isArray(layer.sources)) { errors.push(`layer ${name}: needs a sources list and a features list`); continue; }
    const unknown = layer.sources.filter((id) => !known(id));
    if (unknown.length) errors.push(`layer ${name}: names sources that are not in sources: ${unknown.join(", ")} (LP2)`);
    if (layer.features.length && !layer.sources.length) errors.push(`layer ${name}: has features but names no source (LP2)`);
    if (layer.features.length && layer.sources.length === 1 && layer.sources[0] === UNRECORDED_SOURCE) warnings.push(`layer ${name}: the source was not recorded by the tool that made it`);
    layer.features.forEach((feature, i) => {
      const where = `layer ${name}[${i}]`;
      if (!isObject(feature) || feature.type !== "Feature") { errors.push(`${where}: must be a GeoJSON Feature`); return; }
      if (!isObject(feature.properties)) errors.push(`${where}: properties must be an object`);
      errors.push(...geometryErrors(feature.geometry, where));
    });
  }

  let claims = pkg.claims;
  if (!Array.isArray(claims)) { errors.push("claims must be a list"); claims = []; }
  const seen = new Set();
  claims.forEach((claim, i) => {
    const where = `claim[${i}]`;
    if (!isObject(claim)) { errors.push(`${where}: must be an object`); return; }
    if (!isText(claim.id) || seen.has(claim.id)) errors.push(`${where}: needs a unique id`);
    seen.add(claim.id);
    if (!isText(claim.statement)) errors.push(`${where}: needs a statement`);
    if (!CLAIM_KINDS.includes(claim.kind)) errors.push(`${where}: kind must be one of ${CLAIM_KINDS.join(", ")} (LP3)`);
    const named = claim.sources === undefined || claim.sources === null ? [] : claim.sources;
    if (!Array.isArray(named) || named.some((id) => !known(id))) errors.push(`${where}: names a source that is not in sources (LP2)`);
    const count = Array.isArray(named) ? named.length : 0;
    if (!count && !isText(claim.method)) errors.push(`${where}: must name a source or a method (LP2)`);
    if (claim.kind === "measured" && !count) errors.push(`${where}: a measured claim must name the source of the measurement (LP3)`);
    const hasValue = "value" in claim && claim.value !== null;
    if (hasValue && !isNumber(claim.value)) errors.push(`${where}: value must be a finite number`);
    if (hasValue && !claim.unit) errors.push(`${where}: a value needs a unit`);
  });

  if (!Array.isArray(pkg.not_retrieved)) errors.push("not_retrieved must be a list, empty when everything was retrieved (LP3)");
  else pkg.not_retrieved.forEach((entry, i) => {
    if (!(isObject(entry) && isText(entry.source) && NOT_RETRIEVED_STATUS.includes(entry.status) && isText(entry.consequence))) errors.push(`not_retrieved[${i}]: needs source, status (${NOT_RETRIEVED_STATUS.join(", ")}) and consequence (LP3)`);
  });

  if ("extensions" in pkg && !isObject(pkg.extensions)) errors.push("extensions must be an object keyed by tool name");
  if ("receipt" in pkg && !isObject(pkg.receipt)) errors.push("receipt must be an object");
  const integrity = pkg.integrity;
  if (!(isObject(integrity) && integrity.algorithm === "sha256" && typeof integrity.content_sha256 === "string")) errors.push("integrity must give algorithm sha256 and content_sha256 (LP5)");
  return { errors, warnings };
}

// Structure and hash. Returns { errors, warnings }.
export async function validate(pkg) {
  const { errors, warnings } = validateStructure(pkg);
  if (!errors.length) {
    let actual = null;
    try { actual = await contentSha256(pkg); } catch { errors.push("the package holds a value that cannot be written as JSON (LP8)"); }
    if (actual !== null && actual !== pkg.integrity.content_sha256) errors.push("integrity.content_sha256 does not match the content (LP5)");
  }
  return { errors, warnings };
}

// Thrown when a package cannot be built or converted without breaking a rule.
export class LandPackageError extends Error {
  constructor(message) { super(message); this.name = "LandPackageError"; }
}

// A copy with integrity set from its content (LP5).
export async function seal(pkg) {
  const sealed = {};
  for (const key of Object.keys(pkg)) if (key !== "integrity") sealed[key] = pkg[key];
  const copy = JSON.parse(JSON.stringify(sealed));
  copy.integrity = { algorithm: "sha256", content_sha256: await contentSha256(copy) };
  return copy;
}

// The text to write to a file: sorted keys, two-space indent, newline at the end (LP8).
export function dumps(pkg) {
  const ordered = (value) => Array.isArray(value) ? value.map(ordered)
    : isObject(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])])) : value;
  return JSON.stringify(ordered(pkg), null, 2) + "\n";
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const sameUnits = (units) => isObject(units) && Object.keys(units).length === 2 && units.length === "m" && units.area === "m2";

// LP6: wrap a DFM Landscape Package v1 as a Land Package without losing anything.
export async function fromDfm(dfm) {
  if (!isObject(dfm) || dfm.dfm_package !== "1.0") throw new LandPackageError('not a DFM Landscape Package v1 (dfm_package must be "1.0")');
  if (dfm.crs !== CRS || !sameUnits(dfm.units)) throw new LandPackageError("the DFM package is not in EPSG:4326 with metres; it is not reprojected here (LP1)");
  const layersIn = dfm.layers;
  if (!isObject(layersIn)) throw new LandPackageError("the DFM package has no layers object");
  const sources = clone(dfm.sources || {});
  if (Object.prototype.hasOwnProperty.call(sources, UNRECORDED_SOURCE)) throw new LandPackageError(`the DFM package already uses the reserved source id '${UNRECORDED_SOURCE}'`);
  const recorded = Object.keys(sources).sort();
  const hasFeatures = (features) => Array.isArray(features) ? features.length > 0 : Boolean(features);
  const needsPlaceholder = !recorded.length && Object.values(layersIn).some(hasFeatures);
  if (needsPlaceholder) sources[UNRECORDED_SOURCE] = { title: "Source not recorded in the DFM Landscape Package" };
  const layerSources = recorded.length ? recorded : needsPlaceholder ? [UNRECORDED_SOURCE] : [];
  const layers = {};
  for (const [name, features] of Object.entries(layersIn)) layers[name] = { sources: hasFeatures(features) ? [...layerSources] : [], features: clone(features) };
  const parcels = layersIn.parcels || [];
  const consents = new Set(parcels.map((feature) => (feature && feature.properties ? feature.properties.consent : undefined)));
  const consent = !parcels.length ? "not_applicable" : consents.size === 1 && consents.has("covered") ? "covered" : "none";
  const extra = {};
  for (const key of Object.keys(dfm)) if (!["crs", "units", "layers"].includes(key)) extra[key] = clone(dfm[key]);
  extra.layer_order = Object.keys(layersIn);
  extra.top_level_order = Object.keys(dfm);
  return seal({
    land_package: VERSION,
    name: String(dfm.name || "DFM Landscape Package"),
    created: String(dfm.created || "1970-01-01"),
    generator: { tool: String(dfm.generator || "DFM Landscape Package v1") },
    crs: CRS, units: { length: "m", area: "m2" },
    subject: { kind: "landscape", area_m2: null },
    privacy: { location: "exact", personal_data: parcels.length > 0, consent },
    sources, layers, claims: [], not_retrieved: [],
    extensions: { dfm: extra },
  });
}

// LP6: recover the DFM Landscape Package a Land Package was made from.
export async function toDfm(pkg) {
  const { errors } = await validate(pkg);
  if (errors.length) throw new LandPackageError(errors.slice(0, 6).join("; ") + (errors.length > 6 ? `; and ${errors.length - 6} more` : ""));
  const extra = isObject(pkg.extensions) ? pkg.extensions.dfm : undefined;
  if (!isObject(extra) || extra.dfm_package !== "1.0") throw new LandPackageError("this Land Package was not made from a DFM Landscape Package");
  const layers = {};
  for (const name of extra.layer_order) layers[name] = clone(pkg.layers[name].features);
  const added = Object.keys(pkg.layers).filter((name) => !Object.prototype.hasOwnProperty.call(layers, name));
  if (added.length) throw new LandPackageError("layers added since conversion would be lost in DFM form: " + added.join(", "));
  const out = {};
  for (const key of extra.top_level_order) out[key] = key === "crs" ? CRS : key === "units" ? { length: "m", area: "m2" } : key === "layers" ? layers : clone(extra[key]);
  return out;
}

// LP4: may this package be shown to people beyond its holder? Derived, never stored.
export function shareable(pkg) {
  const privacy = isObject(pkg) && isObject(pkg.privacy) ? pkg.privacy : {};
  return privacy.personal_data === false && ["holder", "covered", "not_applicable"].includes(privacy.consent);
}

// A plain summary for display. Call only on a package that validated.
export function summarize(pkg) {
  const byKind = Object.fromEntries(CLAIM_KINDS.map((kind) => [kind, pkg.claims.filter((c) => c.kind === kind).length]));
  return {
    name: pkg.name, created: pkg.created, tool: pkg.generator.tool, subject: pkg.subject.kind,
    areaM2: pkg.subject.area_m2 ?? null,
    layers: Object.entries(pkg.layers).map(([name, layer]) => ({ name, features: layer.features.length, sources: layer.sources.map((id) => pkg.sources[id].title) })),
    claims: pkg.claims.map(({ id, statement, kind, value, unit }) => ({ id, statement, kind, value: value ?? null, unit: unit ?? null })),
    claimsByKind: byKind,
    notRetrieved: pkg.not_retrieved.map(({ source, status, consequence }) => ({ source, status, consequence })),
    privacy: { ...pkg.privacy }, shareable: shareable(pkg),
    extensions: Object.keys(pkg.extensions ?? {}), sha256: pkg.integrity.content_sha256,
  };
}
