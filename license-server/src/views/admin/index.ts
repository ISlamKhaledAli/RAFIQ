import { adminStyles } from './styles.ts';
import { adminTemplate } from './template.ts';
import { adminScripts } from './scripts.ts';

/**
 * Assemble and serve the Admin HTML Dashboard
 */
export function serveAdminHtml(): Response {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="author" content="ISlam Khaled Ali">
  <meta name="copyright" content="Copyright © 2026 ISlam Khaled Ali. All rights reserved.">
  <title>لوحة إدارة تراخيص رفيق POS — تطوير: ISlam Khaled Ali</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
${adminStyles}
  </style>
</head>
<body>
${adminTemplate}
  <script>
${adminScripts}
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
