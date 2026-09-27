---
description: Language and Output Rules
---

- ALWAYS communicate in English.
- NEVER switch languages unless explicitly requested.
- Do not generate multilingual text.
- Do not mix languages within a response.
- Keep all UI text in English.
- Keep all comments and documentation in English.
- If uncertain, continue in English.
- Never generate corrupted, random, or mixed-language text.
- Before modifying files, verify that generated content is coherent and valid.

# UI Redesign Safety

You are modifying an existing production web application.

Your task is UI/UX redesign only.

DO NOT modify:

- Prisma schema
- Database structure
- API routes
- API business logic
- Authentication
- Authorization
- Inventory calculations
- Stock-in logic
- Stock-out logic
- Order processing
- Cart logic
- Checkout logic
- Server-side validation
- Existing business rules

You MAY modify:

- React components
- Tailwind CSS
- Layouts
- Typography
- Colors
- Spacing
- Buttons
- Cards
- Tables
- Navigation presentation
- Responsive layouts
- Loading states
- Empty states
- Visual hierarchy
- Accessibility

Preserve all existing functionality.

Before changing a file, inspect its existing implementation.

Do not rewrite functional logic simply to achieve a visual redesign.
