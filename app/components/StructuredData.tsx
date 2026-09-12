import React from "react";

interface StructuredDataProps {
  data: Record<string, any> | Array<Record<string, any>> | null | undefined;
}

/**
 * Safely renders application/ld+json script tags for search engine crawlers.
 */
export function StructuredData({ data }: StructuredDataProps) {
  if (!data) return null;

  const jsonString = JSON.stringify(data);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonString }}
    />
  );
}
