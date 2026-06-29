// ─────────────────────────────────────────────────────────────────────────────
// scripts/seedMenu.mjs  —  One-time helper to populate sample menu data
//
// Standalone Node script — NOT part of the Next.js app. Run once to put test
// categories + items into Firestore.
//
// Usage:
//   1. npm install   (firebase-admin is already a devDependency)
//   2. Download a service account key:
//      Firebase Console -> Project Settings -> Service Accounts ->
//      Generate new private key
//   3. Save it as scripts/serviceAccountKey.json (gitignored — never commit)
//   4. npm run seed:menu
//
// SECURITY: serviceAccountKey.json grants full admin access to your Firebase
// project. Never commit it, never paste its contents anywhere. If a key is
// ever exposed, revoke it immediately in Firebase Console and generate a new one.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountPath = join(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const categories = [
  { id: "cat_cocktails", name_en: "Cocktails", name_mm: "ကော်တေးများ", icon: "🍸", sortOrder: 1 },
  { id: "cat_appetizers", name_en: "Appetizers", name_mm: "အစားအစာ", icon: "🍤", sortOrder: 2 },
  { id: "cat_mains", name_en: "Mains", name_mm: "အဓိကအစားအစာ", icon: "🍽️", sortOrder: 3 },
  { id: "cat_beer", name_en: "Beer", name_mm: "ဘီယာ", icon: "🍺", sortOrder: 4 },
  { id: "cat_wine", name_en: "Wine", name_mm: "ဝိုင်", icon: "🍷", sortOrder: 5 },
];

const items = [
  {
    id: "item_emerald_fizz",
    categoryId: "cat_cocktails",
    name_en: "Emerald Fizz",
    name_mm: "မြရောင်လှုပ်စစ်ကော်တေး",
    description_en: "Botanical gin, electric mint, sparkling lime essence.",
    description_mm: "",
    price: 18,
    imageUrl: null,
    available: true,
    sortOrder: 1,
  },
  {
    id: "item_obsidian_smoke",
    categoryId: "cat_cocktails",
    name_en: "Obsidian Smoke",
    name_mm: "အော်ဘ်စီးဒီးယန်း မီးခိုးငွေ",
    description_en: "Peated scotch, charred cedar, dark cocoa bitters.",
    description_mm: "",
    price: 22,
    imageUrl: null,
    available: true,
    sortOrder: 2,
  },
  {
    id: "item_violet_glow",
    categoryId: "cat_cocktails",
    name_en: "Violet Glow",
    name_mm: "ခရမ်းရောင် လင်းလက်မှု",
    description_en: "Butterfly pea flower, mint syrup, soda, crystallized violets.",
    description_mm: "",
    price: 14,
    imageUrl: null,
    available: false,
    sortOrder: 3,
  },
  {
    id: "item_wagyu_sliders",
    categoryId: "cat_appetizers",
    name_en: "Wagyu Sliders",
    name_mm: "နံပြန် ဝက်ဂျူး ဇလက်ဒါ",
    description_en: "A5 wagyu, truffle aioli, pickled shishito, toasted brioche.",
    description_mm: "",
    price: 24,
    imageUrl: null,
    available: true,
    sortOrder: 1,
  },
  {
    id: "item_arctic_oysters",
    categoryId: "cat_appetizers",
    name_en: "Arctic Oysters",
    name_mm: "အာတိတ် ကာဝါ",
    description_en: "Freshly shucked oysters, cucumber granita, finger lime pearls.",
    description_mm: "",
    price: 32,
    imageUrl: null,
    available: true,
    sortOrder: 2,
  },
];

async function seed() {
  console.log("Seeding categories...");
  for (const cat of categories) {
    const { id, ...data } = cat;
    await db.collection("menuCategories").doc(id).set(data);
    console.log(`  done: ${data.name_en}`);
  }

  console.log("Seeding items...");
  for (const item of items) {
    const { id, ...data } = item;
    await db.collection("menuItems").doc(id).set(data);
    console.log(`  done: ${data.name_en}`);
  }

  console.log(`\nFinished. Categories: ${categories.length} | Items: ${items.length}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
