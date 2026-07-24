export const jsonLdHtml = `<!doctype html>
<html lang="en">
<head>
  <title>Fallback title</title>
  <link rel="canonical" href="/reports/outlook#section">
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "headline": "Regional &amp; Global Outlook",
      "articleBody": "First paragraph.\\n\\nSecond paragraph with evidence.",
      "datePublished": "2026-07-24T09:00:00+09:00",
      "author": [{"name": "Reporter One"}],
      "publisher": {"name": "Example News"}
    }
  </script>
</head>
<body><article><h1>DOM title</h1><p>DOM body.</p></article></body>
</html>`;

export const openGraphHtml = `<!doctype html>
<html lang="en">
<head>
  <meta property="og:title" content="Open Graph Report">
  <meta property="og:site_name" content="Public Information Office">
  <meta property="og:url" content="https://public.example/reports/1">
  <meta property="article:published_time" content="2026-07-20T10:00:00Z">
</head>
<body>
  <nav><h1>Navigation title</h1><a href="/">Home links only</a></nav>
  <aside>Sidebar should not be included.</aside>
  <article>
    <h1>Semantic article title</h1>
    <p>This is the first substantive paragraph.</p>
    <p>This is the second substantive paragraph.</p>
  </article>
  <footer>Footer should not be included.</footer>
</body>
</html>`;

export const mainFallbackHtml = `<!doctype html>
<html lang="ko">
<head><title>Fallback Policy Brief</title></head>
<body>
  <nav>Menu menu menu</nav>
  <div role="main">
    <h1>Policy Brief Heading</h1>
    <p>정책 보고서의 첫 번째 문단입니다.</p>
    <p>정책 보고서의 두 번째 문단입니다.</p>
  </div>
</body>
</html>`;

export const genericLegalHtml = `<!doctype html>
<html lang="en">
<head>
  <meta name="dc.title" content="General Data Protection Regulation">
  <link rel="canonical" href="https://law.example/legal/regulation-1">
</head>
<body>
  <main>
    <h1>General Data Protection Regulation</h1>
    <p>Article 1 establishes the subject matter and objectives.</p>
    <p>Article 2 defines the material scope of this regulation.</p>
  </main>
</body>
</html>`;
