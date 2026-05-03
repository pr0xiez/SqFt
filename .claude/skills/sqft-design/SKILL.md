---
name: sqft-design
description: Use this skill to generate well-branded interfaces and assets for SqFt, a flooring estimate-and-job book for small contractors. Use it for production work, throwaway prototypes, mocks, sales decks, marketing pages, or anything that needs to look like part of the SqFt product family. Contains the Quiet Modern design language — paper neutrals + vermilion accent, Inter Tight + JetBrains Mono pairing — plus design tokens, components, and a working UI kit.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. The fastest way to produce on-brand SqFt output is to start from `colors_and_type.css` (tokens) plus `ui_kits/sqft-app/sqft.css` and `ui_kits/sqft-app/components.jsx` (components).

If working on production code, copy assets and read the rules in README.md to become an expert in designing with this brand. Pay special attention to the **Content fundamentals** section (sentence case, mono labels, no emoji, em-dash + middle-dot connective punctuation) and the **Visual foundations** section (warm paper neutrals, single vermilion accent, hairline borders, no resting shadows on cards).

Iconography is monoline inline SVG (1.7 stroke, 22×22 viewBox, rounded caps and joins). Don't introduce a third icon style.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.
