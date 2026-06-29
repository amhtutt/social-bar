// ─────────────────────────────────────────────────────────────────────────────
// scripts/bootstrapVenue.mjs  —  One-time: create your first venue + admin
//
// Run this ONCE to bootstrap multi-tenant support for your existing bar.
// It does three things:
//   1. Creates a Firebase Auth admin account for you
//   2. Creates the venues/{venueId} document (venueId = your admin's uid)
//   3. Stamps venueId onto every EXISTING menuCategories/menuItems document
//      that doesn't have one yet — so your already-seeded menu data keeps
//      working under the new venue-scoped queries instead of becoming
//      invisible.
//
// Usage:
//   1. npm install   (firebase-admin is already a devDependency)
//   2. Make sure scripts/serviceAccountKey.json exists
//   3. Edit the CONFIG block below with your details
//   4. node scripts/bootstrapVenue.mjs
//   5. IMPORTANT: copy the printed venueId, you'll need it for the
//      tablet setup URL: yourapp.com/?venue=<that-id>
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import admin from "firebase-admin";

// CONFIG — edit these before running
const CONFIG = {
  venueName: "Your Venue Name",
  adminEmail: "you@example.com",
  adminPassword: "change-this-password",
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountPath = join(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

async function bootstrap() {
  console.log("Creating admin account...");
  const userRecord = await auth.createUser({
    email: CONFIG.adminEmail,
    password: CONFIG.adminPassword,
  });
  const venueId = userRecord.uid;

  console.log("Creating venue document...");
  await db.collection("venues").doc(venueId).set({
    name: CONFIG.venueName,
    ownerUid: venueId,
    config: {
      games: false,
      menu: true,
      ordering: true,
      chat: false,
      callServer: true,
      bill: true,
      pricing: {
        taxRatePercent: 0,
        serviceChargeRatePercent: 0,
        taxInclusive: false,
      },
      staffPin: "0000",
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log("Creating admin user profile...");
  await db.collection("users").doc(venueId).set({
    email: CONFIG.adminEmail,
    role: "admin",
    venueId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log("Stamping venueId onto existing menu data...");
  let categoriesUpdated = 0;
  const categoriesSnap = await db.collection("menuCategories").get();
  for (const docSnap of categoriesSnap.docs) {
    if (!docSnap.data().venueId) {
      await docSnap.ref.update({ venueId });
      categoriesUpdated++;
    }
  }

  let itemsUpdated = 0;
  const itemsSnap = await db.collection("menuItems").get();
  for (const docSnap of itemsSnap.docs) {
    if (!docSnap.data().venueId) {
      await docSnap.ref.update({ venueId });
      itemsUpdated++;
    }
  }

  console.log("\n========================================");
  console.log("Bootstrap complete!");
  console.log("========================================");
  console.log(`Admin email:        ${CONFIG.adminEmail}`);
  console.log(`Venue ID:            ${venueId}`);
  console.log(`Categories migrated: ${categoriesUpdated}`);
  console.log(`Items migrated:      ${itemsUpdated}`);
  console.log("\nNext steps:");
  console.log("1. Sign in at /admin with the email/password above");
  console.log(`2. Set up each tablet by visiting: yourapp.com/?venue=${venueId}`);
  console.log("========================================\n");

  process.exit(0);
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
