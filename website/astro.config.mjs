// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  site: "https://zod-vault.ndlz.net",
  integrations: [
    starlight({
      title: "zod-vault",
      description: "End-to-end encrypted cloud sync for Zustand stores",
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: true,
      },
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/nicodlz/zod-vault" },
      ],
      head: [
        {
          tag: "meta",
          attrs: { property: "og:image", content: "https://zod-vault.ndlz.net/og.png" },
        },
      ],
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "guides/introduction" },
            { label: "Quick Start", slug: "guides/quick-start" },
            { label: "Migration from persist()", slug: "guides/migration" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Authentication", slug: "guides/authentication" },
            { label: "Syncing Data", slug: "guides/syncing" },
            { label: "Self-Hosting", slug: "guides/self-hosting" },
          ],
        },
        {
          label: "API Reference",
          autogenerate: { directory: "reference" },
        },
        {
          label: "Security",
          items: [
            { label: "Security Model", slug: "security/model" },
            { label: "Recovery Key", slug: "security/recovery-key" },
          ],
        },
      ],
      editLink: {
        baseUrl: "https://github.com/nicodlz/zod-vault/edit/master/website/",
      },
    }),
  ],
});
