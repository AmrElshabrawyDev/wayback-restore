/**
 * Early checks that save users from runs that can't work: huge platforms
 * (youtube.com has billions of archived pages and nothing of "yours" to restore).
 */

// Big platforms and everything under them (m.youtube.com, ar-ar.facebook.com…)
const PLATFORMS = [
  "youtube.com", "youtu.be", "google.com", "facebook.com", "fb.com", "instagram.com", "whatsapp.com",
  "twitter.com", "x.com", "tiktok.com", "linkedin.com", "snapchat.com", "pinterest.com", "reddit.com",
  "telegram.org", "t.me", "wikipedia.org", "amazon.com", "ebay.com", "aliexpress.com", "netflix.com",
  "microsoft.com", "apple.com", "yahoo.com", "bing.com", "baidu.com", "github.com", "stackoverflow.com",
];
// Hosting services: their own homepage is huge, but user sites on them are fine (name.wordpress.com)
const HOSTS = ["wordpress.com", "blogspot.com", "medium.com", "tumblr.com", "wix.com", "github.io", "netlify.app", "vercel.app", "salla.sa", "zid.store", "myshopify.com"];

/** The platform's name if the domain is a big platform rather than someone's website */
export function largePlatform(domain) {
  const d = String(domain).toLowerCase().replace(/^www\./, "");
  return PLATFORMS.find((p) => d === p || d.endsWith(`.${p}`)) ?? HOSTS.find((h) => d === h);
}

export const largePlatformMessage = (domain, platform) =>
  `${domain} is a large platform (${platform}), not a website you can restore — it has millions of archived pages.\n` +
  "wayback-restore is for recovering your own (or your client's) site, e.g. example.com or yourname.wordpress.com.\n" +
  "If you really mean it, run again with --force (and narrow it with --include).";
