"use client";

// ─────────────────────────────────────────────────────────────────────────────
// app/admin/page.js  —  Admin: Menu Editor + Staff Management
//
// Wrapped in AdminGuard, requiring role "admin" specifically — managers
// and servers are redirected to an access-denied screen. They use /staff
// instead (the Floor View order-management screen), linked from here.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { signOut } from "@/lib/userService";
import { theme } from "@/lib/theme";
import AdminGuard from "@/components/admin/AdminGuard";
import CategoryManager from "@/components/admin/CategoryManager";
import ItemManager from "@/components/admin/ItemManager";
import StaffManager from "@/components/admin/StaffManager";
import PricingSettings from "@/components/admin/PricingSettings";

const TABS = [
  { id: "categories", label: "Categories" },
  { id: "items", label: "Items" },
  { id: "pricing", label: "Pricing" },
  { id: "staff", label: "Staff" },
];

export default function AdminPage() {
  return (
    <AdminGuard requiredRoles={["admin"]}>
      <AdminPageContent />
    </AdminGuard>
  );
}

function AdminPageContent() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState("categories");

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Menu Editor</h1>
          <p style={styles.subtitle}>Manage categories, items, and staff accounts.</p>
        </div>
        <div style={styles.userArea}>
          <Link href="/staff" style={styles.floorViewLink}>
            Floor View →
          </Link>
          <span style={styles.userEmail}>{profile?.email}</span>
          <button onClick={() => signOut()} style={styles.signOutBtn}>
            Sign Out
          </button>
        </div>
      </header>

      <div style={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tabBtn,
              ...(activeTab === tab.id ? styles.tabBtnActive : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {activeTab === "categories" && <CategoryManager />}
        {activeTab === "items" && <ItemManager />}
        {activeTab === "pricing" && <PricingSettings />}
        {activeTab === "staff" && <StaffManager />}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: theme.color.bg,
    padding: "32px 24px 60px",
  },
  header: {
    maxWidth: 900,
    margin: "0 auto 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  title: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 28,
    color: theme.color.textPrimary,
    margin: "0 0 6px",
  },
  subtitle: {
    fontFamily: theme.font.body,
    fontSize: 14,
    color: theme.color.textMuted,
    margin: 0,
  },
  userArea: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  floorViewLink: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 13,
    color: theme.color.accent,
    textDecoration: "none",
  },
  userEmail: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textMuted,
  },
  signOutBtn: {
    padding: "8px 16px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textSecondary,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },
  tabBar: {
    maxWidth: 900,
    margin: "0 auto 24px",
    display: "flex",
    gap: 8,
    borderBottom: `1px solid ${theme.color.border}`,
  },
  tabBtn: {
    padding: "10px 18px",
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    color: theme.color.textMuted,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  tabBtnActive: {
    color: theme.color.accent,
    borderBottom: `2px solid ${theme.color.accent}`,
  },
  content: {
    maxWidth: 900,
    margin: "0 auto",
  },
};
