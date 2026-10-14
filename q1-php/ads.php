<?php
/**
 * Ad-marker replacement and request parsing for the search template.
 * Pure functions: no WordPress dependency, so they can be unit tested.
 */

/**
 * Replace each literal "[ad]" marker with an ad placeholder div.
 *
 * Assumptions:
 *  - Marker is the exact, case-sensitive text "[ad]".
 *  - Runs AFTER the_content filters (wpautop, shortcodes), so the marker may
 *    arrive as "<p>[ad]</p>". A div inside <p> is invalid HTML, so a marker
 *    that is alone in its paragraph replaces the whole <p>.
 *  - Markers inside running text still become a div (as the brief asks); the
 *    browser will close the <p> around it. Editors should put [ad] on its own line.
 *  - Numbering is shared across the page via $counter, so ids stay unique.
 *  - The div is empty: a JS handler swaps in the live ad using data-ad-slot.
 */
function bcm_replace_ad_markers(string $content, int &$counter = 0): string
{
    $make = static function () use (&$counter): string {
        $counter++;
        return '<div class="ad ad-' . $counter . '" data-ad-slot="' . $counter . '"></div>';
    };

    // Marker alone in a paragraph: replace the paragraph.
    $content = preg_replace_callback('#<p>\s*\[ad\]\s*</p>#', $make, $content);
    // Remaining markers.
    return preg_replace_callback('#\[ad\]#', $make, $content);
}

/** Positive integer from ?page=, default 1. Handles missing, array, junk, 0, negative. */
function bcm_get_page(array $query): int
{
    $raw = $query['page'] ?? 1;
    return is_scalar($raw) ? max(1, (int) $raw) : 1;
}

/** Plain-text search term from ?s=. Empty string when missing or not a string. */
function bcm_get_search(array $query): string
{
    $raw = $query['s'] ?? '';
    if (!is_string($raw)) {
        return '';
    }
    return trim(sanitize_text_field(wp_unslash($raw)));
}
