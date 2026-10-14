<?php
/**
 * Ad-marker replacement and request parsing for the search template.
 * Pure functions: no WordPress dependency, so they can be unit tested.
 */

/** Replace each literal "[ad]" with an empty ad div. Assumptions are listed in ANSWERS.md (Q1). */
function bcm_replace_ad_markers(string $content, int &$counter = 0): string
{
    $make = static function () use (&$counter): string {
        $counter++;
        return '<div class="ad ad-' . $counter . '" data-ad-slot="' . $counter . '"></div>';
    };

    // A marker alone in its <p> replaces the <p> (a div inside <p> is invalid).
    $content = preg_replace_callback('#<p>\s*\[ad\]\s*</p>#', $make, $content) ?? $content;
    return preg_replace_callback('#\[ad\]#', $make, $content) ?? $content;
}

function bcm_get_page(array $query): int
{
    $raw = $query['page'] ?? 1;
    return is_scalar($raw) ? max(1, (int) $raw) : 1;
}

function bcm_get_search(array $query): string
{
    $raw = $query['s'] ?? '';
    if (!is_string($raw)) {
        return '';
    }
    return trim(sanitize_text_field(wp_unslash($raw)));
}
