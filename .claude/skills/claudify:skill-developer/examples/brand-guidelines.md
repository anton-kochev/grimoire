# Brand Guidelines Skill Example

This is a complete example of a skill that applies corporate branding standards to documents.

```yaml
---
name: applying-brand-guidelines
description: This skill applies consistent corporate branding and styling to all generated documents including colors, fonts, layouts, and messaging
---

# Corporate Brand Guidelines Skill

This skill ensures all generated documents adhere to corporate brand standards for consistent, professional communication.

## Brand Identity

### Company: Acme Corporation
**Tagline**: "Innovation Through Excellence"
**Industry**: Technology Solutions

## Visual Standards

### Color Palette

**Primary Colors**:
- **Acme Blue**: #0066CC (RGB: 0, 102, 204) - Headers, primary buttons
- **Acme Navy**: #003366 (RGB: 0, 51, 102) - Text, accents
- **White**: #FFFFFF - Backgrounds, reverse text

**Secondary Colors**:
- **Success Green**: #28A745 - Positive metrics
- **Warning Amber**: #FFC107 - Cautions
- **Error Red**: #DC3545 - Negative values
- **Neutral Gray**: #6C757D - Secondary text

### Typography

**Primary Font Family**: Segoe UI, system-ui, sans-serif

**Font Hierarchy**:
- **H1**: 32pt, Bold, Acme Blue
- **H2**: 24pt, Semibold, Acme Navy
- **H3**: 18pt, Semibold, Acme Navy
- **Body**: 11pt, Regular, Acme Navy
- **Caption**: 9pt, Regular, Neutral Gray

## Document Standards

### PowerPoint Templates
- Title slide: Acme Blue background, white text
- Content slides: White background, Acme Navy text
- Charts: Use primary/secondary color palette
- Footer: Company name, page number, date

### Excel Workbooks
- Header row: Acme Blue background, white bold text
- Data rows: Alternating white/light gray (#F8F9FA)
- Numbers: Right-aligned, 2 decimal places
- Currency: $ prefix, comma separators

### PDF Documents
- Page size: Letter (8.5" x 11")
- Margins: 1" all sides
- Header: Company logo (top-left), document title (top-right)
- Footer: Page numbers centered

## Content Guidelines

### Tone and Voice
- **Professional yet approachable**: Avoid jargon, use clear language
- **Confident and innovative**: Emphasize solutions and possibilities
- **Customer-focused**: Address client needs and benefits

### Messaging Standards
- Lead with value proposition
- Use active voice
- Keep sentences concise (<20 words)
- Include call-to-action in conclusions

## Scripts

- `apply_brand.py`: Automated brand formatting application
- `validate_brand.py`: Brand compliance verification
```

## Key Takeaways

This example demonstrates:

1. **Standards enforcement pattern**: Detailed specifications for compliance
2. **Reference materials**: Colors, fonts, layouts as on-demand resources
3. **Multi-format support**: PowerPoint, Excel, PDF standards
4. **Content + visual**: Both design and messaging guidelines
5. **Validation scripts**: Automated brand compliance checking
