"use client";

import NewsPanel from "@/src/components/news/NewsPanel";

export default function NewsPage() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <NewsPanel userId="current-user" />
      </div>
    </div>
  );
}
