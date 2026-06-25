/**
 * Deterministic seed-data generator for the Stock Manager POS (Algerian
 * single-store clothing shop). Emits an idempotent SQL file (`seeds/seed.sql`)
 * that wipes the demo tables and re-inserts a fully interconnected dataset.
 *
 * It mirrors the exact write conventions of the app's data layer so the seed is
 * internally consistent:
 *   - variants.stock == SUM(inventory_movements.delta)               (inventory.ts)
 *   - completed sale line  -> -qty 'sale' movement                   (sales.ts)
 *   - confirmed purchase line -> +qty 'receiving' movement           (purchases.ts)
 *   - refund return, restock -> +qty 'return' movement; damaged -> none (returns.ts)
 *   - sale codes FAC-YYYY-NNNN, purchases A-NNNNNN, returns R-NNNNNN
 *   - retail prices are TTC; HT/TVA back-derived (computeSaleTotals)
 *   - purchase costs are HT; TVA added on top (computePurchaseTotals)
 *   - cash session expected = float + especes-sale paid + pay_in - pay_out - return net
 *   - named-customer at-sale versement recorded in customer_payments
 *
 * Run:  node seeds/generate-seed.mjs   ->   seeds/seed.sql
 * The dataset is deterministic (fixed PRNG seed): regenerating is byte-stable.
 */

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) + helpers
// ---------------------------------------------------------------------------
let _s = 0x9e3779b9;
function rng() {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a, b) => a + Math.floor(rng() * (b - a + 1)); // inclusive int
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const chance = (p) => rng() < p;
const DA = (dinars) => Math.round(dinars * 100); // dinars -> centimes (minor units)

// Period: 6 months ending just before "today" (2026-06-23).
const START = new Date(Date.UTC(2026, 0, 1, 9, 0, 0));
const END = new Date(Date.UTC(2026, 5, 21, 19, 0, 0));
const DAY = 86400000;
function ts(date) {
  // 'YYYY-MM-DD HH:MM:SS' (matches CURRENT_TIMESTAMP / app rows, UTC)
  return date.toISOString().slice(0, 19).replace("T", " ");
}
function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// SQL emission helpers
// ---------------------------------------------------------------------------
const out = [];
const w = (s) => out.push(s);
function sql(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function insert(table, cols, rows) {
  if (rows.length === 0) return;
  w(`INSERT INTO ${table} (${cols.join(", ")}) VALUES`);
  const lines = rows.map(
    (r) => "  (" + cols.map((c) => sql(r[c])).join(", ") + ")",
  );
  // chunk to keep statements reasonable
  const CHUNK = 200;
  for (let i = 0; i < lines.length; i += CHUNK) {
    const slice = lines.slice(i, i + CHUNK);
    if (i > 0) w(`INSERT INTO ${table} (${cols.join(", ")}) VALUES`);
    w(slice.join(",\n") + ";");
  }
}

// ---------------------------------------------------------------------------
// Algerian reference data
// ---------------------------------------------------------------------------
const CITIES = [
  ["Alger", "16000"], ["Oran", "31000"], ["Constantine", "25000"],
  ["Annaba", "23000"], ["Blida", "09000"], ["Sétif", "19000"],
  ["Batna", "05000"], ["Tlemcen", "13000"], ["Béjaïa", "06000"],
  ["Tizi Ouzou", "15000"], ["Djelfa", "17000"], ["Biskra", "07000"],
];
const MALE = ["Mohamed", "Ahmed", "Karim", "Yacine", "Sofiane", "Bilal", "Riad", "Amine", "Walid", "Nabil", "Salim", "Reda", "Toufik", "Mourad", "Adel"];
const FEMALE = ["Amina", "Fatima", "Nadia", "Yasmine", "Sara", "Lila", "Imene", "Houda", "Soraya", "Meriem", "Wassila", "Khadidja", "Sabrina", "Lynda"];
const SURNAMES = ["Benali", "Hamidi", "Belkacem", "Khelifi", "Bouzid", "Cherif", "Saadi", "Mansouri", "Brahimi", "Ziani", "Haddad", "Larbi", "Meziane", "Boudiaf", "Ouali", "Slimani", "Taleb", "Yahiaoui", "Zerrouki", "Amrani"];
const COMPANIES = [
  "Boutique Élégance", "Sarl Mode Express", "Eurl Style & Co", "Confection El Baraka",
  "Sarl Textile Atlas", "Maison du Vêtement", "Eurl Prêt-à-Porter DZ",
];

function phoneMobile() {
  return `0${pick(["5", "6", "7"])}${ri(10000000, 99999999)}`.slice(0, 10);
}
function phoneFixe(city) {
  return `0${ri(20, 49)}${ri(100000, 999999)}`;
}
function nif() { return String(ri(1, 9)) + Array.from({ length: 14 }, () => ri(0, 9)).join(""); }
function nis() { return String(ri(1, 9)) + Array.from({ length: 14 }, () => ri(0, 9)).join(""); }
function rc() { return `${ri(10, 16)}/${ri(10, 99)}-${ri(100000, 999999)} B ${ri(10, 24)}`; }
function art() { return `${ri(10, 49)}${Array.from({ length: 9 }, () => ri(0, 9)).join("")}`; }
function rib() { return Array.from({ length: 20 }, () => ri(0, 9)).join(""); }

// ---------------------------------------------------------------------------
// 1) Settings (upsert; preserves migration-seeded keys)
// ---------------------------------------------------------------------------
w("-- ===========================================================================");
w("-- Seed data for Stock Manager (Algerian clothing POS). Generated file — see");
w("-- seeds/generate-seed.mjs. Idempotent: wipes demo tables then re-inserts.");
w("-- Money is INTEGER minor units (centimes); 1 DA = 100. Dates are UTC.");
w("-- ===========================================================================");
w("");
w("PRAGMA foreign_keys = OFF;");
w("BEGIN TRANSACTION;");
w("");

const WIPE = [
  "activity_log", "product_images", "customer_payments", "supplier_payments",
  "cash_events", "cash_sessions", "held_sales", "promotions",
  "return_out_items", "return_in_items", "returns",
  "sale_items", "sales", "purchase_items", "purchases",
  "inventory_movements", "variants", "products", "customers", "suppliers",
  "categories",
];
w("-- Clear demo tables (children first). Lookups/settings are preserved.");
for (const t of WIPE) w(`DELETE FROM ${t};`);
w(`DELETE FROM sqlite_sequence WHERE name IN (${WIPE.map((t) => `'${t}'`).join(", ")});`);
w("");

w("-- Shop profile / fiscal identity (used by Studio commercial documents).");
const settings = {
  shop_name: "Boutique Le Dressing",
  currency_symbol: "DA",
  currency_decimals: "2",
  receipt_header: "Boutique Le Dressing — Prêt-à-porter",
  receipt_footer: "Merci de votre visite !",
  shop_address: "12 Rue Larbi Ben M'hidi, Alger Centre, 16000 Alger",
  shop_phone: "021 63 45 78",
  shop_email: "contact@ledressing.dz",
  shop_logo: "",
  shop_nif: nif(),
  shop_nis: nis(),
  shop_rc: rc(),
  shop_art: art(),
  default_tva_rate: "19",
  sale_code_prefix: "FAC",
  default_low_stock_threshold: "5",
  barcode_symbology: "ean13",
  barcode_prefix: "20",
  require_manager_pin: "0",
};
const setRows = Object.entries(settings).map(([key, value]) => ({ key, value }));
w("INSERT INTO settings (key, value) VALUES");
w(setRows.map((r) => `  (${sql(r.key)}, ${sql(r.value)})`).join(",\n"));
w("  ON CONFLICT(key) DO UPDATE SET value = excluded.value;");
w("");

// Extra (numeric) shoe sizes, idempotent and clear of the migration range.
w("-- Numeric shoe sizes (apparel sizes XS–XXXL come from migration 002).");
w("INSERT OR IGNORE INTO sizes (id, name, sort_order) VALUES");
const SHOE_SIZES = [[30, "38", 38], [31, "39", 39], [32, "40", 40], [33, "41", 41], [34, "42", 42], [35, "43", 43], [36, "44", 44]];
w(SHOE_SIZES.map((s) => `  (${s[0]}, '${s[1]}', ${s[2]})`).join(",\n") + ";");
w("");

// size/color id maps (from migration 002)
const SZ = { XS: 1, S: 2, M: 3, L: 4, XL: 5, XXL: 6, XXXL: 7 };
const APPAREL = [SZ.S, SZ.M, SZ.L, SZ.XL];
const APPAREL_FULL = [SZ.XS, SZ.S, SZ.M, SZ.L, SZ.XL, SZ.XXL];
const KIDS = [SZ.XS, SZ.S, SZ.M];
const SHOE = SHOE_SIZES.map((s) => s[0]);
const CO = { Black: 1, White: 2, Grey: 3, Navy: 4, Blue: 5, Red: 6, Green: 7, Beige: 8, Brown: 9, Pink: 10 };

// ---------------------------------------------------------------------------
// 2) Categories
// ---------------------------------------------------------------------------
const categories = [
  "Hommes", "Femmes", "Enfants", "Chaussures", "Accessoires",
  "Sport", "Sous-vêtements", "Vestes & Manteaux",
];
const CAT = {};
categories.forEach((name, i) => (CAT[name] = i + 1));
insert("categories", ["id", "name", "created_at"],
  categories.map((name, i) => ({ id: i + 1, name, created_at: ts(START) })));
w("");

// ---------------------------------------------------------------------------
// 3) Suppliers (with fiscal/legal fields)
// ---------------------------------------------------------------------------
const supplierDefs = [
  ["Sarl Textile Atlas", "Grossiste textile", false],
  ["Eurl Confection El Nour", "Confection prêt-à-porter", false],
  ["Sarl Denim Industrie", "Fabricant jeans & denim", false],
  ["Import Mode Méditerranée", "Importateur prêt-à-porter", false],
  ["Sarl Chaussures du Sud", "Grossiste chaussures", false],
  ["Eurl Accessoires & Cuir", "Maroquinerie & accessoires", false],
  ["Sarl Sport Wear DZ", "Vêtements de sport", false],
  ["Confection Lingerie Fine", "Sous-vêtements & bonneterie", false],
  ["Etablissement Bouchama", "Grossiste tissus (archivé)", true],
  ["Sarl Hiver Collection", "Vestes & manteaux", false],
];
const suppliers = supplierDefs.map(([name, activity, archived], i) => {
  const [city, zip] = pick(CITIES);
  return {
    id: i + 1, name,
    contact_name: `${pick(MALE)} ${pick(SURNAMES)}`,
    phone: phoneMobile(), email: `commercial@${name.toLowerCase().replace(/[^a-z]+/g, "")}.dz`,
    address: `Zone d'activité, ${city} ${zip}`, notes: null,
    archived: archived ? 1 : 0, created_at: ts(START),
    activity, phone_fixe: phoneFixe(city), fax: phoneFixe(city),
    nif: nif(), nis: nis(), rc: rc(), art_imposition: art(), rib: rib(),
  };
});
insert("suppliers",
  ["id", "name", "contact_name", "phone", "email", "address", "notes", "archived",
    "created_at", "activity", "phone_fixe", "fax", "nif", "nis", "rc", "art_imposition", "rib"],
  suppliers);
w("");

// ---------------------------------------------------------------------------
// 4) Customers (mix of walk-in named + B2B with fiscal fields)
// ---------------------------------------------------------------------------
const customers = [];
let custId = 0;
// 6 business (entreprise) customers — TVA invoices + account credit
for (let i = 0; i < 6; i++) {
  const name = COMPANIES[i] ?? `Sarl Client ${i}`;
  const [city, zip] = pick(CITIES);
  customers.push({
    id: ++custId, name, phone: phoneMobile(),
    email: `achat@client${i + 1}.dz`, note: "Compte professionnel",
    archived: 0, created_at: ts(new Date(START.getTime() + ri(0, 30) * DAY)),
    address: `${ri(1, 99)} Bd du 1er Novembre, ${city} ${zip}`,
    phone_fixe: phoneFixe(city), fax: phoneFixe(city), activity: "Commerce de détail",
    nif: nif(), nis: nis(), rc: rc(), art_imposition: art(), rib: rib(),
  });
}
// 24 individual customers (light records)
for (let i = 0; i < 24; i++) {
  const male = chance(0.5);
  const name = `${male ? pick(MALE) : pick(FEMALE)} ${pick(SURNAMES)}`;
  customers.push({
    id: ++custId, name, phone: phoneMobile(), email: null,
    note: chance(0.2) ? "Cliente fidèle" : null, archived: chance(0.08) ? 1 : 0,
    created_at: ts(new Date(START.getTime() + ri(0, 150) * DAY)),
    address: chance(0.3) ? `${pick(CITIES)[0]}` : null,
    phone_fixe: null, fax: null, activity: null,
    nif: null, nis: null, rc: null, art_imposition: null, rib: null,
  });
}
const bizCustomers = customers.slice(0, 6);
insert("customers",
  ["id", "name", "phone", "email", "note", "archived", "created_at", "address",
    "phone_fixe", "fax", "activity", "nif", "nis", "rc", "art_imposition", "rib"],
  customers);
w("");

// ---------------------------------------------------------------------------
// 5) Products + variants (size x color)
// ---------------------------------------------------------------------------
// archetype: [name, categoryId, brand, supplierId, costDA, priceDA, sizeSet, colorSet]
const APP = "apparel";
const archetypes = [
  ["T-shirt Homme Col Rond", CAT.Hommes, "Atlas Basics", 1, 700, 1500, APPAREL, [CO.Black, CO.White, CO.Navy, CO.Grey]],
  ["Chemise Homme Manches Longues", CAT.Hommes, "El Nour", 2, 1400, 2900, APPAREL, [CO.White, CO.Blue, CO.Navy]],
  ["Polo Homme Piqué", CAT.Hommes, "Atlas Basics", 1, 950, 1990, APPAREL, [CO.Navy, CO.White, CO.Red, CO.Green]],
  ["Jean Slim Homme", CAT.Hommes, "Denim Co", 3, 1900, 3900, APPAREL_FULL, [CO.Navy, CO.Black, CO.Blue]],
  ["Pantalon Chino Homme", CAT.Hommes, "El Nour", 2, 1600, 3300, APPAREL, [CO.Beige, CO.Navy, CO.Black]],
  ["Pull Homme Col V", CAT.Hommes, "Hiver Collection", 10, 1700, 3500, APPAREL, [CO.Grey, CO.Navy, CO.Brown]],
  ["Sweat à Capuche Homme", CAT.Hommes, "Sport Wear DZ", 7, 1500, 3200, APPAREL, [CO.Black, CO.Grey, CO.Navy]],
  ["Short Homme", CAT.Hommes, "El Nour", 2, 800, 1700, APPAREL, [CO.Beige, CO.Navy, CO.Black]],
  ["Robe Femme Évasée", CAT.Femmes, "Med Mode", 4, 2100, 4500, APPAREL, [CO.Black, CO.Red, CO.Navy, CO.Pink]],
  ["Blouse Femme", CAT.Femmes, "El Nour", 2, 1200, 2600, APPAREL, [CO.White, CO.Pink, CO.Beige]],
  ["Jupe Femme Plissée", CAT.Femmes, "Med Mode", 4, 1300, 2800, APPAREL, [CO.Black, CO.Navy, CO.Grey]],
  ["Jean Femme Skinny", CAT.Femmes, "Denim Co", 3, 1850, 3800, APPAREL_FULL, [CO.Blue, CO.Black, CO.Navy]],
  ["Pull Femme Maille", CAT.Femmes, "Hiver Collection", 10, 1600, 3400, APPAREL, [CO.Beige, CO.Pink, CO.Grey, CO.White]],
  ["Cardigan Femme", CAT.Femmes, "Hiver Collection", 10, 1750, 3600, APPAREL, [CO.Grey, CO.Black, CO.Beige]],
  ["Robe Soirée Femme", CAT.Femmes, "Med Mode", 4, 3200, 6900, [SZ.S, SZ.M, SZ.L], [CO.Black, CO.Red]],
  ["T-shirt Enfant Imprimé", CAT.Enfants, "Atlas Basics", 1, 450, 990, KIDS, [CO.White, CO.Blue, CO.Red, CO.Pink]],
  ["Pantalon Enfant", CAT.Enfants, "El Nour", 2, 700, 1500, KIDS, [CO.Navy, CO.Grey, CO.Beige]],
  ["Robe Fille", CAT.Enfants, "Med Mode", 4, 900, 1990, KIDS, [CO.Pink, CO.Red, CO.White]],
  ["Survêtement Enfant", CAT.Enfants, "Sport Wear DZ", 7, 1300, 2700, KIDS, [CO.Navy, CO.Black, CO.Red]],
  ["Pyjama Enfant", CAT.Enfants, "Lingerie Fine", 8, 600, 1300, KIDS, [CO.Blue, CO.Pink, CO.Grey]],
  ["Baskets Homme Running", CAT.Chaussures, "Chaussures Sud", 5, 2600, 5500, SHOE, [CO.Black, CO.White, CO.Grey]],
  ["Baskets Femme Sneakers", CAT.Chaussures, "Chaussures Sud", 5, 2400, 4990, SHOE, [CO.White, CO.Pink, CO.Black]],
  ["Chaussures Ville Homme", CAT.Chaussures, "Accessoires & Cuir", 6, 3200, 6900, SHOE, [CO.Black, CO.Brown]],
  ["Sandales Femme", CAT.Chaussures, "Chaussures Sud", 5, 1500, 3200, SHOE, [CO.Beige, CO.Black, CO.Brown]],
  ["Bottines Femme", CAT.Chaussures, "Accessoires & Cuir", 6, 2900, 5990, SHOE, [CO.Black, CO.Brown]],
  ["Casquette", CAT.Accessoires, "Sport Wear DZ", 7, 350, 850, null, [CO.Black, CO.Navy, CO.Red, CO.White]],
  ["Ceinture en Cuir", CAT.Accessoires, "Accessoires & Cuir", 6, 600, 1490, null, [CO.Black, CO.Brown]],
  ["Écharpe", CAT.Accessoires, "Hiver Collection", 10, 500, 1200, null, [CO.Grey, CO.Navy, CO.Red, CO.Beige]],
  ["Sac à Main Femme", CAT.Accessoires, "Accessoires & Cuir", 6, 1800, 3900, null, [CO.Black, CO.Brown, CO.Beige]],
  ["Portefeuille Cuir", CAT.Accessoires, "Accessoires & Cuir", 6, 700, 1690, null, [CO.Black, CO.Brown]],
  ["Survêtement Homme", CAT.Sport, "Sport Wear DZ", 7, 2200, 4500, APPAREL, [CO.Black, CO.Navy, CO.Grey]],
  ["Short Sport", CAT.Sport, "Sport Wear DZ", 7, 650, 1400, APPAREL, [CO.Black, CO.Navy, CO.Red]],
  ["Legging Femme Sport", CAT.Sport, "Sport Wear DZ", 7, 800, 1800, [SZ.S, SZ.M, SZ.L], [CO.Black, CO.Grey, CO.Navy]],
  ["Débardeur Sport", CAT.Sport, "Sport Wear DZ", 7, 500, 1200, APPAREL, [CO.Black, CO.White, CO.Blue]],
  ["Veste de Sport", CAT.Sport, "Sport Wear DZ", 7, 1900, 3900, APPAREL, [CO.Black, CO.Navy]],
  ["Chaussettes (lot de 3)", CAT["Sous-vêtements"], "Lingerie Fine", 8, 300, 750, null, [CO.Black, CO.White, CO.Grey]],
  ["Boxer Homme (lot de 2)", CAT["Sous-vêtements"], "Lingerie Fine", 8, 450, 1100, [SZ.S, SZ.M, SZ.L, SZ.XL], [CO.Black, CO.Navy]],
  ["Sous-vêtement Femme", CAT["Sous-vêtements"], "Lingerie Fine", 8, 400, 990, [SZ.S, SZ.M, SZ.L], [CO.Black, CO.White, CO.Pink, CO.Beige]],
  ["Maillot de Corps", CAT["Sous-vêtements"], "Lingerie Fine", 8, 350, 850, APPAREL, [CO.White, CO.Grey]],
  ["Pyjama Femme", CAT["Sous-vêtements"], "Lingerie Fine", 8, 1100, 2400, [SZ.S, SZ.M, SZ.L], [CO.Pink, CO.Grey, CO.Navy]],
  ["Veste en Cuir Homme", CAT["Vestes & Manteaux"], "Accessoires & Cuir", 6, 5500, 11900, APPAREL, [CO.Black, CO.Brown]],
  ["Manteau d'Hiver Femme", CAT["Vestes & Manteaux"], "Hiver Collection", 10, 4800, 9900, APPAREL, [CO.Black, CO.Beige, CO.Navy]],
  ["Doudoune Homme", CAT["Vestes & Manteaux"], "Hiver Collection", 10, 4200, 8700, APPAREL_FULL, [CO.Black, CO.Navy, CO.Grey]],
  ["Blazer Homme", CAT["Vestes & Manteaux"], "El Nour", 2, 3600, 7500, APPAREL, [CO.Navy, CO.Black, CO.Grey]],
  ["Trench Femme", CAT["Vestes & Manteaux"], "Hiver Collection", 10, 3900, 8200, APPAREL, [CO.Beige, CO.Black]],
  ["Parka Homme", CAT["Vestes & Manteaux"], "Hiver Collection", 10, 4100, 8500, APPAREL, [CO.Green, CO.Navy, CO.Black]],
  ["Gilet Sans Manches", CAT["Vestes & Manteaux"], "Hiver Collection", 10, 2400, 4900, APPAREL, [CO.Black, CO.Grey, CO.Navy]],
  ["Bonnet Laine", CAT.Accessoires, "Hiver Collection", 10, 300, 790, null, [CO.Grey, CO.Black, CO.Navy, CO.Red]],
  ["Gants Cuir", CAT.Accessoires, "Accessoires & Cuir", 6, 650, 1490, null, [CO.Black, CO.Brown]],
  ["Foulard Femme", CAT.Accessoires, "Med Mode", 4, 450, 1100, null, [CO.Red, CO.Pink, CO.Beige, CO.Navy]],
];

const products = [];
const variants = [];
let variantId = 0;
const variantList = []; // for simulation: {id, productId, price, cost, stock, threshold}

archetypes.forEach((a, idx) => {
  const [name, categoryId, brand, supplierId, costDA, priceDA, sizeSet, colorSet] = a;
  const pid = idx + 1;
  const createdAt = ts(new Date(START.getTime() + ri(0, 5) * DAY));
  const archived = idx === 14 && false; // none archived among first; mark one later
  products.push({
    id: pid, name, category_id: categoryId, brand,
    description: `${name} — ${brand}.`,
    cost_cents: DA(costDA), price_cents: DA(priceDA),
    archived: 0, created_at: createdAt, updated_at: createdAt,
    supplier_id: supplierId, reference: `REF-${String(1000 + pid)}`,
    low_stock_threshold: pick([4, 5, 6, 8]),
    reorder_quantity: pick([10, 12, 20, 24]),
    out_of_stock_alert: 1, notes: null,
  });
  const sizes = sizeSet ?? [null];
  for (const s of sizes) {
    for (const c of colorSet) {
      const vid = ++variantId;
      // small per-variant price jitter for premium colors? keep inherit (NULL) mostly
      const overridePrice = chance(0.12) ? DA(priceDA + pick([100, 200, -100])) : null;
      variants.push({
        id: vid, product_id: pid, size_id: s, color_id: c,
        sku: `P${pid}-S${s ?? "X"}-C${c}`, barcode: `P${pid}-S${s ?? "X"}-C${c}`,
        price_cents: overridePrice, cost_cents: null, stock: 0, archived: 0,
        created_at: createdAt,
      });
      variantList.push({
        id: vid, productId: pid, supplierId,
        price: overridePrice ?? DA(priceDA), cost: DA(costDA),
        stock: 0, threshold: products[pid - 1].low_stock_threshold,
      });
    }
  }
});

// Archive one product (+ its variants) to exercise the archived state.
const ARCHIVED_PID = 40; // "Maillot de Corps"
products[ARCHIVED_PID - 1].archived = 1;
products[ARCHIVED_PID - 1].notes = "Fin de série — archivé.";
for (const v of variants) if (v.product_id === ARCHIVED_PID) v.archived = 1;

// ---------------------------------------------------------------------------
// Movement ledger + simulation state
// ---------------------------------------------------------------------------
const movements = [];
let movementId = 0;
function move(variantId, delta, reason, refType, refId, note, createdAt) {
  movements.push({
    id: ++movementId, variant_id: variantId, delta, reason,
    ref_type: refType ?? null, ref_id: refId ?? null, note: note ?? null,
    created_at: createdAt,
  });
  const v = variantList.find((x) => x.id === variantId);
  v.stock += delta;
}
const vById = (id) => variantList.find((x) => x.id === id);

// ---------------------------------------------------------------------------
// 6) Cash sessions (weekly reconciliation windows covering the whole period)
// ---------------------------------------------------------------------------
const sessions = [];
{
  let cur = new Date(START.getTime());
  let sid = 0;
  while (cur < END) {
    const open = new Date(cur.getTime());
    open.setUTCHours(9, 0, 0, 0);
    const close = new Date(open.getTime() + 6 * DAY);
    close.setUTCHours(19, 30, 0, 0);
    const realClose = close > END ? END : close;
    sessions.push({
      id: ++sid, openTs: ts(open), closeTs: ts(realClose),
      openMs: open.getTime(), closeMs: realClose.getTime(),
      opening_float_cents: DA(5000),
      payIn: 0, payOut: 0, salesCash: 0, returnsCash: 0,
      cashier: pick(["Karim B.", "Amina H.", "Sofiane M."]),
    });
    cur = new Date(open.getTime() + 7 * DAY);
  }
}
function sessionForMs(ms) {
  for (const s of sessions) if (ms >= s.openMs && ms <= s.closeMs) return s;
  return sessions[sessions.length - 1];
}
function randDateInSession(s) {
  const ms = s.openMs + Math.floor(rng() * (s.closeMs - s.openMs));
  return new Date(ms);
}

// ---------------------------------------------------------------------------
// 7) Opening stock via confirmed purchases (one per supplier, dated Jan 2)
// ---------------------------------------------------------------------------
const purchases = [];
const purchaseItems = [];
const supplierPayments = [];
let purchaseId = 0;
let purchaseItemId = 0;
let supplierPaymentId = 0;
let confirmedPurchaseSeq = 0;

function nextPurchaseCode() {
  confirmedPurchaseSeq += 1;
  return `A-${String(confirmedPurchaseSeq).padStart(6, "0")}`;
}

function addConfirmedPurchase(supplierId, dateObj, lines, tvaEnabled, terms, note, invoiceRef) {
  const pid = ++purchaseId;
  const code = nextPurchaseCode();
  let subtotal = 0;
  for (const l of lines) {
    const lineTotal = Math.round(l.qty * l.unit_cost);
    subtotal += lineTotal;
    purchaseItems.push({
      id: ++purchaseItemId, purchase_id: pid, variant_id: l.variant_id,
      description: l.description, qty: l.qty, unit: l.unit ?? "u",
      unit_cost_ht_cents: l.unit_cost, line_total_ht_cents: lineTotal,
    });
    if (l.variant_id != null) {
      const recvQty = Math.round(l.qty);
      move(l.variant_id, recvQty, "receiving", "purchase", pid, code, ts(dateObj));
      const v = vById(l.variant_id);
      if (v) v.cost = l.unit_cost; // approximate weighted-avg cost roll
    }
  }
  const tvaRate = tvaEnabled ? 19 : 0;
  const tva = tvaEnabled ? Math.round((subtotal * tvaRate) / 100) : 0;
  const totalTtc = subtotal + tva;
  const p = {
    id: pid, code, supplier_id: supplierId, status: "confirmed",
    purchase_date: dateOnly(dateObj), invoice_ref: invoiceRef ?? null, note: note ?? null,
    tva_enabled: tvaEnabled ? 1 : 0, tva_rate: tvaRate,
    subtotal_ht_cents: subtotal, tva_cents: tva, total_ttc_cents: totalTtc,
    paid_cents: 0, payment_terms: terms,
    created_at: ts(dateObj), confirmed_at: ts(dateObj),
  };
  purchases.push(p);
  return p;
}

// Pay a (confirmed) purchase: full / partial / none, recording versements.
function paySupplier(p, mode) {
  if (mode === "none") return;
  const payDate = new Date(new Date(p.created_at.replace(" ", "T") + "Z").getTime() + ri(0, 4) * DAY);
  const amounts = [];
  if (mode === "full") amounts.push(p.total_ttc_cents);
  else if (mode === "partial") amounts.push(Math.round(p.total_ttc_cents * pick([0.4, 0.5, 0.6])));
  for (const amt of amounts) {
    const method = pick(["cash", "cash", "cheque", "transfer"]);
    let cashEventId = null;
    if (method === "cash") {
      const s = sessionForMs(payDate.getTime());
      cashEventId = { sessionId: s.id, amount: amt }; // placeholder resolved later
      s.payOut += amt;
    }
    supplierPayments.push({
      _cash: cashEventId, id: ++supplierPaymentId, supplier_id: p.supplier_id,
      purchase_id: p.id, amount_cents: amt, method,
      reference: method === "cheque" ? `CHQ-${ri(100000, 999999)}` : (method === "transfer" ? `VIR-${ri(100000, 999999)}` : p.code),
      note: `Règlement ${p.code}`, created_at: ts(payDate),
    });
    p.paid_cents += amt;
  }
}

// Opening purchases: bulk-receive starting stock for every active variant.
const openingDate = new Date(Date.UTC(2026, 0, 2, 10, 0, 0));
for (const sup of suppliers) {
  if (sup.archived) continue;
  const supVariants = variantList.filter((v) => v.supplierId === sup.id && !variants[v.id - 1].archived);
  if (supVariants.length === 0) continue;
  const lines = supVariants.map((v) => {
    const qty = ri(14, 38);
    return {
      variant_id: v.id, qty, unit: "u", unit_cost: v.cost,
      description: variantDescription(v.id),
    };
  });
  const tvaEnabled = chance(0.5);
  const p = addConfirmedPurchase(sup.id, openingDate, lines, tvaEnabled,
    pick(["cash", "partial", "credit"]), "Stock d'ouverture", `F-${ri(1000, 9999)}/26`);
  paySupplier(p, pick(["full", "full", "partial", "none"]));
}

function variantDescription(vid) {
  const v = variants[vid - 1];
  const p = products[v.product_id - 1];
  const sizeName = v.size_id ? Object.keys(SZ).find((k) => SZ[k] === v.size_id) || SHOE_SIZES.find((s) => s[0] === v.size_id)?.[1] : null;
  const colorName = Object.keys(CO).find((k) => CO[k] === v.color_id);
  return [p.name, sizeName, colorName].filter(Boolean).join(" / ");
}

// ---------------------------------------------------------------------------
// 8) Sales over the period (chronological; respects running stock)
// ---------------------------------------------------------------------------
const sales = [];
const saleItems = [];
const customerPayments = [];
let saleId = 0;
let saleItemId = 0;
let customerPaymentId = 0;
let saleSeq = 0;

const returns = [];
const returnInItems = [];
let returnId = 0;
let returnInItemId = 0;
let returnSeq = 0;

const completedSaleRefs = []; // for later returns: {saleId, items:[{saleItemId, variantId, qty, unit, desc}]}

function activeSellableVariants() {
  return variantList.filter((v) => v.stock > 0 && !variants[v.id - 1].archived);
}

for (const session of sessions) {
  const nSales = ri(8, 16);
  for (let k = 0; k < nSales; k++) {
    const when = randDateInSession(session);
    const pool = activeSellableVariants();
    if (pool.length === 0) continue;

    const nLines = ri(1, 4);
    const chosen = new Set();
    const lines = [];
    for (let li = 0; li < nLines; li++) {
      const v = pick(pool);
      if (chosen.has(v.id)) continue;
      chosen.add(v.id);
      const maxQ = Math.min(3, v.stock);
      if (maxQ <= 0) continue;
      const qty = ri(1, maxQ);
      const unit = v.price;
      const lineDiscount = chance(0.12) ? DA(pick([50, 100, 150, 200])) : 0;
      lines.push({ variant_id: v.id, qty, unit, lineDiscount, desc: variantDescription(v.id) });
    }
    if (lines.length === 0) continue;

    // Determine sale shape
    const voided = chance(0.03);
    let customer = null;
    let tvaEnabled = false;
    if (chance(0.28)) {
      customer = pick(customers.filter((c) => !c.archived));
      if (bizCustomers.includes(customer) && chance(0.7)) tvaEnabled = true;
    }
    const method = tvaEnabled
      ? pick(["virement", "cheque", "especes", "ccp"])
      : pick(["especes", "especes", "especes", "especes", "cib", "cheque"]);

    let subtotal = lines.reduce((s, l) => s + Math.max(0, l.qty * l.unit - l.lineDiscount), 0);
    const cartDiscount = chance(0.1) ? DA(pick([100, 200, 300, 500])) : 0;
    const totalTtc = Math.max(0, subtotal - cartDiscount);

    // TVA back-derivation (computeSaleTotals)
    let subtotalHt = totalTtc, tva = 0, rate = 0;
    if (tvaEnabled) {
      rate = 19;
      subtotalHt = Math.round((totalTtc * 100) / (100 + rate));
      tva = totalTtc - subtotalHt;
    }

    // Payment: full, or credit (named customer only)
    let paid = totalTtc;
    let credit = false;
    if (customer && !voided && chance(0.25)) {
      credit = true;
      paid = Math.round(totalTtc * pick([0, 0.3, 0.5, 0.7]));
    }
    if (voided) paid = 0;

    const tendered = method === "especes" && !voided
      ? totalTtc + (chance(0.5) ? pick([0, 0, DA(100), DA(500), DA(1000)]) : 0)
      : paid;
    const change = method === "especes" && !voided ? Math.max(0, tendered - totalTtc) : 0;

    saleSeq += 1;
    const code = `FAC-2026-${String(saleSeq).padStart(4, "0")}`;
    const sid = ++saleId;
    sales.push({
      id: sid, code, subtotal_cents: subtotal, cart_discount_cents: cartDiscount,
      total_cents: totalTtc, cash_tendered_cents: tendered, change_cents: change,
      status: voided ? "voided" : "completed",
      note: voided ? "Vente annulée" : (credit ? "Vente à crédit" : null),
      created_at: ts(when), customer_id: customer ? customer.id : null,
      tva_enabled: tvaEnabled ? 1 : 0, tva_rate: rate,
      subtotal_ht_cents: subtotalHt, tva_cents: tva, total_ttc_cents: totalTtc,
      paid_cents: voided ? 0 : paid, payment_method: method,
    });

    const refItems = [];
    for (const l of lines) {
      const lineTotal = Math.max(0, l.qty * l.unit - l.lineDiscount);
      const siId = ++saleItemId;
      saleItems.push({
        id: siId, sale_id: sid, variant_id: l.variant_id, description: l.desc,
        qty: l.qty, unit_price_cents: l.unit, line_discount_cents: l.lineDiscount,
        line_total_cents: lineTotal, qty_returned: 0,
      });
      if (!voided) {
        move(l.variant_id, -l.qty, "sale", "sale", sid, null, ts(when));
        refItems.push({ saleItemId: siId, variantId: l.variant_id, qty: l.qty, unit: l.unit, desc: l.desc });
      }
    }

    if (!voided) {
      if (method === "especes") session.salesCash += paid;
      // At-sale versement for named customers (mirrors completeSale).
      if (customer && paid > 0) {
        customerPayments.push({
          id: ++customerPaymentId, customer_id: customer.id, sale_id: sid,
          amount_cents: paid, method, reference: code, note: null,
          cash_event_id: null, created_at: ts(when),
        });
      }
      if (refItems.length) completedSaleRefs.push({ saleId: sid, code, customerId: customer?.id ?? null, when, items: refItems });
    }
  }

  // Returns (refunds) referencing earlier completed sales — a few per session.
  const nReturns = chance(0.6) ? ri(0, 2) : 0;
  for (let r = 0; r < nReturns; r++) {
    const eligible = completedSaleRefs.filter((s) => s.when.getTime() < session.openMs);
    if (eligible.length === 0) continue;
    const src = pick(eligible);
    const item = pick(src.items);
    if (item.qty <= 0) continue;
    const when = randDateInSession(session);
    const qty = 1;
    const restock = chance(0.85); // most restock; some damaged-out
    returnSeq += 1;
    const rid = ++returnId;
    const rcode = `R-${String(returnSeq).padStart(6, "0")}`;
    const value = qty * item.unit;
    returns.push({
      id: rid, code: rcode, original_sale_id: src.saleId, kind: "refund",
      return_value_cents: value, exchange_value_cents: 0, net_cash_cents: value,
      note: restock ? null : "Article défectueux — non remis en stock",
      created_at: ts(when),
    });
    returnInItems.push({
      id: ++returnInItemId, return_id: rid, variant_id: item.variantId,
      sale_item_id: item.saleItemId, description: item.desc, qty,
      unit_price_cents: item.unit, restock: restock ? 1 : 0,
    });
    if (restock) move(item.variantId, qty, "return", "return", rid, null, ts(when));
    // reduce sale_items.qty_returned + the in-memory remaining qty
    const si = saleItems.find((x) => x.id === item.saleItemId);
    if (si) si.qty_returned += qty;
    item.qty -= qty;
    session.returnsCash += value;
  }
}

// ---------------------------------------------------------------------------
// 9) Mid-period restock purchases for low-stock variants (a few, confirmed)
// ---------------------------------------------------------------------------
for (let i = 0; i < 6; i++) {
  const when = new Date(START.getTime() + (40 + i * 22) * DAY);
  const sup = pick(suppliers.filter((s) => !s.archived));
  const low = variantList
    .filter((v) => v.supplierId === sup.id && !variants[v.id - 1].archived && v.stock < 12)
    .slice(0, 8);
  if (low.length === 0) continue;
  const lines = low.map((v) => ({
    variant_id: v.id, qty: ri(10, 24), unit: "u", unit_cost: v.cost,
    description: variantDescription(v.id),
  }));
  const p = addConfirmedPurchase(sup.id, when, lines, chance(0.5),
    pick(["cash", "partial", "credit"]), "Réapprovisionnement", `F-${ri(1000, 9999)}/26`);
  paySupplier(p, pick(["full", "partial", "none"]));
}

// Draft purchase (no stock effect, no code) + a cancelled one.
{
  const sup = pick(suppliers.filter((s) => !s.archived));
  const v = variantList.filter((x) => x.supplierId === sup.id).slice(0, 4);
  const when = new Date(END.getTime() - 5 * DAY);
  const pid = ++purchaseId;
  let subtotal = 0;
  const lines = v.map((x) => ({ variant_id: x.id, qty: ri(10, 20), unit_cost: x.cost }));
  for (const l of lines) {
    const lt = Math.round(l.qty * l.unit_cost);
    subtotal += lt;
    purchaseItems.push({
      id: ++purchaseItemId, purchase_id: pid, variant_id: l.variant_id,
      description: variantDescription(l.variant_id), qty: l.qty, unit: "u",
      unit_cost_ht_cents: l.unit_cost, line_total_ht_cents: lt,
    });
  }
  purchases.push({
    id: pid, code: null, supplier_id: sup.id, status: "draft",
    purchase_date: dateOnly(when), invoice_ref: null, note: "Brouillon — à confirmer",
    tva_enabled: 0, tva_rate: 19, subtotal_ht_cents: subtotal, tva_cents: 0,
    total_ttc_cents: subtotal, paid_cents: 0, payment_terms: "credit",
    created_at: ts(when), confirmed_at: null,
  });
}
{
  const sup = pick(suppliers.filter((s) => !s.archived));
  const v = variantList.filter((x) => x.supplierId === sup.id).slice(0, 3);
  const when = new Date(START.getTime() + 60 * DAY);
  const pid = ++purchaseId;
  let subtotal = 0;
  for (const x of v) {
    const qty = ri(8, 15);
    const lt = Math.round(qty * x.cost);
    subtotal += lt;
    purchaseItems.push({
      id: ++purchaseItemId, purchase_id: pid, variant_id: x.id,
      description: variantDescription(x.id), qty, unit: "u",
      unit_cost_ht_cents: x.cost, line_total_ht_cents: lt,
    });
  }
  purchases.push({
    id: pid, code: null, supplier_id: sup.id, status: "cancelled",
    purchase_date: dateOnly(when), invoice_ref: null, note: "Annulé — fournisseur en rupture",
    tva_enabled: 0, tva_rate: 19, subtotal_ht_cents: subtotal, tva_cents: 0,
    total_ttc_cents: subtotal, paid_cents: 0, payment_terms: "credit",
    created_at: ts(when), confirmed_at: null,
  });
}

// ---------------------------------------------------------------------------
// 10) Later customer versements (paying down credit sales) + a global payment
// ---------------------------------------------------------------------------
const cashEvents = [];
let cashEventId = 0;
function addCashEvent(sessionId, kind, amount, reason, createdAt) {
  const id = ++cashEventId;
  cashEvents.push({ id, session_id: sessionId, kind, amount_cents: amount, reason, created_at: createdAt });
  return id;
}

// Credit sales: those with reste due. Pay some of them down later (in a later session).
const creditSales = sales.filter((s) => s.status === "completed" && s.customer_id && s.paid_cents < s.total_ttc_cents);
for (const cs of creditSales) {
  if (chance(0.45)) continue; // ~45% stay outstanding (open A/R)
  const reste = cs.total_ttc_cents - cs.paid_cents;
  const payAmt = chance(0.6) ? reste : Math.round(reste * pick([0.4, 0.5]));
  const baseMs = new Date(cs.created_at.replace(" ", "T") + "Z").getTime();
  const when = new Date(Math.min(END.getTime() - DAY, baseMs + ri(7, 40) * DAY));
  const method = pick(["especes", "especes", "cheque", "virement"]);
  const session = sessionForMs(when.getTime());
  let cevId = null;
  if (method === "especes") {
    cevId = addCashEvent(session.id, "pay_in", payAmt, `Versement client — ${cs.code}`, ts(when));
    session.payIn += payAmt;
  }
  customerPayments.push({
    id: ++customerPaymentId, customer_id: cs.customer_id, sale_id: cs.id,
    amount_cents: payAmt, method, reference: cs.code, note: "Règlement reste dû",
    cash_event_id: cevId, created_at: ts(when),
  });
}

// One global account payment (not tied to a sale) from a business customer.
{
  const c = pick(bizCustomers);
  const when = new Date(END.getTime() - 10 * DAY);
  const session = sessionForMs(when.getTime());
  const amt = DA(20000);
  const cev = addCashEvent(session.id, "pay_in", amt, "Versement client — acompte", ts(when));
  session.payIn += amt;
  customerPayments.push({
    id: ++customerPaymentId, customer_id: c.id, sale_id: null,
    amount_cents: amt, method: "especes", reference: null, note: "Acompte sur compte",
    cash_event_id: cev, created_at: ts(when),
  });
}

// Resolve supplier cash payments into pay_out cash_events (linked).
for (const sp of supplierPayments) {
  if (sp._cash) {
    const when = new Date(sp.created_at.replace(" ", "T") + "Z");
    const cev = addCashEvent(sp._cash.sessionId, "pay_out", sp.amount_cents,
      `Paiement fournisseur — ${sp.note}`, sp.created_at);
    sp.cash_event_id = cev;
  } else {
    sp.cash_event_id = null;
  }
  delete sp._cash;
}

// A few manual drawer events (pay_in float top-up, pay_out expense, no_sale).
for (const s of sessions) {
  if (chance(0.25)) {
    const when = ts(randDateInSession(s));
    const amt = DA(pick([1500, 2000, 3000]));
    addCashEvent(s.id, "pay_out", amt, pick(["Achat fournitures", "Frais de transport", "Note de café"]), when);
    s.payOut += amt;
  }
  if (chance(0.15)) {
    const when = ts(randDateInSession(s));
    addCashEvent(s.id, "no_sale", 0, "Ouverture tiroir", when);
  }
}

// ---------------------------------------------------------------------------
// 11) Close each session: expected = float + especes sales + payIn - payOut - returns
// ---------------------------------------------------------------------------
const cashSessions = sessions.map((s) => {
  const expected = s.opening_float_cents + s.salesCash + s.payIn - s.payOut - s.returnsCash;
  // Most balance; a few have a small variance.
  const variance = chance(0.2) ? DA(pick([-200, -100, 100, 200, 50])) : 0;
  const counted = expected + variance;
  const breakdown = {};
  // simple denomination tally summing to counted (in centimes)
  let rest = Math.max(0, counted);
  for (const d of [DA(2000), DA(1000), DA(500), DA(200), DA(100)]) {
    const q = Math.floor(rest / d);
    if (q > 0) { breakdown[d] = q; rest -= q * d; }
  }
  return {
    id: s.id, opened_at: s.openTs, closed_at: s.closeTs,
    opening_float_cents: s.opening_float_cents, expected_cents: expected,
    counted_cents: counted, variance_cents: variance,
    note: variance === 0 ? "Caisse équilibrée" : (variance > 0 ? "Excédent caisse" : "Manque caisse"),
    cashier_name: s.cashier, opening_note: "Fond de caisse vérifié",
    count_breakdown_json: JSON.stringify(breakdown),
  };
});

// ---------------------------------------------------------------------------
// 12) Promotions (active, scheduled, expired, archived)
// ---------------------------------------------------------------------------
const promotions = [
  { id: 1, name: "Soldes d'hiver -20%", kind: "percent", percent: 20, amount_cents: null, scope_type: "all", scope_id: null, min_qty: 1, priority: 10, active: 1, starts_at: "2026-01-15", ends_at: "2026-02-15", archived: 0 },
  { id: 2, name: "Promo Chaussures -15%", kind: "percent", percent: 15, amount_cents: null, scope_type: "category", scope_id: CAT.Chaussures, min_qty: 1, priority: 5, active: 1, starts_at: null, ends_at: null, archived: 0 },
  { id: 3, name: "Remise T-shirt 100 DA", kind: "fixed", percent: null, amount_cents: DA(100), scope_type: "product", scope_id: 1, min_qty: 2, priority: 3, active: 1, starts_at: null, ends_at: null, archived: 0 },
  { id: 4, name: "Ramadan -10% Femmes", kind: "percent", percent: 10, amount_cents: null, scope_type: "category", scope_id: CAT.Femmes, min_qty: 1, priority: 4, active: 1, starts_at: "2026-03-01", ends_at: "2026-04-01", archived: 0 },
  { id: 5, name: "Black Friday -30%", kind: "percent", percent: 30, amount_cents: null, scope_type: "all", scope_id: null, min_qty: 1, priority: 20, active: 0, starts_at: "2025-11-28", ends_at: "2025-11-30", archived: 1 },
];
const promoRows = promotions.map((p) => ({
  ...p, get_qty: null, bundle_price_cents: null,
  created_at: ts(START),
}));

// ---------------------------------------------------------------------------
// 13) Held (suspended) carts
// ---------------------------------------------------------------------------
const heldSales = [];
for (let i = 0; i < 3; i++) {
  const c = chance(0.5) ? pick(customers.filter((x) => !x.archived)) : null;
  const pool = activeSellableVariants();
  const items = [];
  for (let k = 0; k < ri(1, 3); k++) {
    const v = pick(pool);
    items.push({ variant_id: v.id, description: variantDescription(v.id), qty: ri(1, 2), unit_price_cents: v.price, line_discount_cents: 0 });
  }
  heldSales.push({
    id: i + 1, label: pick(["Client cabine 2", "Mise de côté", "Commande téléphone"]),
    customer_id: c ? c.id : null,
    payload_json: JSON.stringify({ lines: items, cart_discount_cents: 0, customer_id: c ? c.id : null }),
    created_at: ts(new Date(END.getTime() - ri(1, 5) * DAY)),
  });
}

// ---------------------------------------------------------------------------
// 14) Activity log (coarse product audit trail)
// ---------------------------------------------------------------------------
const activity = [];
let activityId = 0;
function logActivity(type, id, action, detail, createdAt) {
  activity.push({ id: ++activityId, entity_type: type, entity_id: id, action, detail, created_at: createdAt });
}
for (const p of products) {
  logActivity("product", p.id, "created", `Produit créé : ${p.name}`, p.created_at);
}
// a handful of later edits
for (let i = 0; i < 12; i++) {
  const p = pick(products);
  const when = ts(new Date(START.getTime() + ri(20, 150) * DAY));
  const action = pick(["updated", "price_changed", "stock_adjusted"]);
  const detail = action === "price_changed" ? "Prix mis à jour" : action === "stock_adjusted" ? "Ajustement d'inventaire" : "Fiche modifiée";
  logActivity("product", p.id, action, detail, when);
}
logActivity("product", ARCHIVED_PID, "archived", "Produit archivé (fin de série)", ts(new Date(END.getTime() - 20 * DAY)));
for (const s of suppliers) logActivity("supplier", s.id, "created", `Fournisseur ajouté : ${s.name}`, s.created_at);

// ---------------------------------------------------------------------------
// 15) A couple of manual stock adjustments (stocktake/shrinkage)
// ---------------------------------------------------------------------------
for (let i = 0; i < 5; i++) {
  const v = pick(variantList.filter((x) => x.stock > 3 && !variants[x.id - 1].archived));
  if (!v) continue;
  const when = new Date(START.getTime() + ri(30, 150) * DAY);
  const delta = pick([-1, -1, -2, 1]);
  if (v.stock + delta < 0) continue;
  move(v.id, delta, delta < 0 ? "adjustment" : "stocktake", null, null,
    delta < 0 ? "Démarque inconnue" : "Inventaire physique", ts(when));
}

// ---------------------------------------------------------------------------
// 15b) Drive a few variants to out-of-stock / low-stock to exercise the alerts
// (clearance / shrinkage adjustments, keeping the ledger consistent).
// ---------------------------------------------------------------------------
{
  const candidates = variantList.filter((x) => x.stock > 0 && !variants[x.id - 1].archived);
  // shuffle deterministically
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const when = new Date(END.getTime() - 6 * DAY);
  // 5 variants -> out of stock
  for (const v of candidates.slice(0, 5)) {
    if (v.stock <= 0) continue;
    move(v.id, -v.stock, "adjustment", null, null, "Liquidation — fin de stock", ts(when));
  }
  // 6 variants -> at/just below low-stock threshold
  for (const v of candidates.slice(5, 11)) {
    const target = Math.max(1, v.threshold - pick([0, 1]));
    if (v.stock > target) move(v.id, target - v.stock, "adjustment", null, null, "Ajustement inventaire", ts(when));
  }
}

// ---------------------------------------------------------------------------
// Finalize variant stock from the ledger
// ---------------------------------------------------------------------------
for (const v of variants) {
  const vl = vById(v.id);
  v.stock = vl.stock;
  v.cost_cents = null; // keep inheriting product cost; cost rolled onto product is approximate
}

// ---------------------------------------------------------------------------
// Emit everything (parents before children; movements already ordered by id)
// ---------------------------------------------------------------------------
w("-- Products");
insert("products",
  ["id", "name", "category_id", "brand", "description", "cost_cents", "price_cents",
    "archived", "created_at", "updated_at", "supplier_id", "reference",
    "low_stock_threshold", "reorder_quantity", "out_of_stock_alert", "notes"],
  products);
w("");
w("-- Variants (size x color); stock is materialized from the movements ledger below");
insert("variants",
  ["id", "product_id", "size_id", "color_id", "sku", "barcode", "price_cents",
    "cost_cents", "stock", "archived", "created_at"],
  variants);
w("");
w("-- Purchases (achats) + lines");
insert("purchases",
  ["id", "code", "supplier_id", "status", "purchase_date", "invoice_ref", "note",
    "tva_enabled", "tva_rate", "subtotal_ht_cents", "tva_cents", "total_ttc_cents",
    "paid_cents", "payment_terms", "created_at", "confirmed_at"],
  purchases);
insert("purchase_items",
  ["id", "purchase_id", "variant_id", "description", "qty", "unit",
    "unit_cost_ht_cents", "line_total_ht_cents"],
  purchaseItems);
w("");
w("-- Sales + lines");
insert("sales",
  ["id", "code", "subtotal_cents", "cart_discount_cents", "total_cents",
    "cash_tendered_cents", "change_cents", "status", "note", "created_at",
    "customer_id", "tva_enabled", "tva_rate", "subtotal_ht_cents", "tva_cents",
    "total_ttc_cents", "paid_cents", "payment_method"],
  sales);
insert("sale_items",
  ["id", "sale_id", "variant_id", "description", "qty", "unit_price_cents",
    "line_discount_cents", "line_total_cents", "qty_returned"],
  saleItems);
w("");
w("-- Returns (refunds) + incoming items");
insert("returns",
  ["id", "code", "original_sale_id", "kind", "return_value_cents",
    "exchange_value_cents", "net_cash_cents", "note", "created_at"],
  returns);
insert("return_in_items",
  ["id", "return_id", "variant_id", "sale_item_id", "description", "qty",
    "unit_price_cents", "restock"],
  returnInItems);
w("");
w("-- Inventory ledger (append-only signed deltas; sum == variants.stock)");
insert("inventory_movements",
  ["id", "variant_id", "delta", "reason", "ref_type", "ref_id", "note", "created_at"],
  movements);
w("");
w("-- Cash sessions + drawer events");
insert("cash_sessions",
  ["id", "opened_at", "closed_at", "opening_float_cents", "expected_cents",
    "counted_cents", "variance_cents", "note", "cashier_name", "opening_note",
    "count_breakdown_json"],
  cashSessions);
insert("cash_events",
  ["id", "session_id", "kind", "amount_cents", "reason", "created_at"],
  cashEvents.sort((a, b) => a.id - b.id));
w("");
w("-- Customer A/R versements (at-sale + later paydowns)");
insert("customer_payments",
  ["id", "customer_id", "sale_id", "amount_cents", "method", "reference", "note",
    "cash_event_id", "created_at"],
  customerPayments.sort((a, b) => a.id - b.id));
w("");
w("-- Supplier versements (achat règlements)");
insert("supplier_payments",
  ["id", "supplier_id", "purchase_id", "amount_cents", "method", "reference",
    "note", "cash_event_id", "created_at"],
  supplierPayments);
w("");
w("-- Promotions");
insert("promotions",
  ["id", "name", "kind", "percent", "amount_cents", "scope_type", "scope_id",
    "min_qty", "get_qty", "bundle_price_cents", "priority", "active",
    "starts_at", "ends_at", "archived", "created_at"],
  promoRows);
w("");
w("-- Held (suspended) carts");
insert("held_sales", ["id", "label", "customer_id", "payload_json", "created_at"], heldSales);
w("");
w("-- Activity log");
insert("activity_log",
  ["id", "entity_type", "entity_id", "action", "detail", "created_at"],
  activity.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((r, i) => ({ ...r })));
w("");
w("COMMIT;");
w("PRAGMA foreign_keys = ON;");
w("");
w(`-- Summary: ${products.length} products, ${variants.length} variants, ` +
  `${suppliers.length} suppliers, ${customers.length} customers, ` +
  `${purchases.length} purchases, ${sales.length} sales, ${returns.length} returns, ` +
  `${cashSessions.length} cash sessions, ${movements.length} movements.`);

// ---------------------------------------------------------------------------
// Write file
// ---------------------------------------------------------------------------
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(__dir, "seed.sql"), out.join("\n") + "\n");
console.error(
  `seed.sql written: ${products.length} products / ${variants.length} variants, ` +
  `${sales.length} sales, ${returns.length} returns, ${purchases.length} purchases, ` +
  `${movements.length} movements, ${cashSessions.length} sessions.`,
);
