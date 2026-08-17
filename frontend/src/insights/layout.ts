/**
 * viewBox widths for the Insights charts, in the units the cards are laid out in.
 *
 * An SVG on this page is scaled to its card by CSS, which scales its text along
 * with it — so the viewBox has to be about as wide as the card really is, or the
 * labels come out half size. Two card sizes, two widths.
 */
export const CHART_W = { half: 560, wide: 1100 }
