# semi-cobot UI design decisions

Applied the UI UX Pro Max skill from nextlevelbuilder/ui-ux-pro-max-skill, using its manufacturing-inventory design-system search and React accessibility guidance.

The verified style match was Flat Design for a corporate dashboard: restrained decoration, consistent outlined icons, dense data organization, neutral surfaces and green status accents. The proposed conversion-oriented Feature-Rich Showcase pattern did not fit an internal workspace, so the application uses sidebar navigation, calculated summary cards, a reference-board preview, and a filterable inventory table. The initial Fira Sans/Fira Code font pairing fit the engineering context. A later library/academic typography result was rejected as unrelated.

The green brand palette is an intentional adaptation of the industrial slate/stock-green recommendation. The board is functional 3D content explicitly requested by the user; other UI surfaces remain flat. Status text accompanies color. Dialogs use native focus trapping and Escape dismissal. Component picking has a keyboard-accessible list and SVG alternative. Form inputs have visible labels; export and import have busy feedback. Responsive layouts were checked at 375, 768, 1024 and 1440 pixels. Reduced-motion preference disables interface transitions.
