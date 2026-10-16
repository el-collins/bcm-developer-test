<?php
// Minimal WordPress stubs so the template runs without WordPress.
error_reporting(E_ALL);
set_error_handler(function ($no, $str, $file, $line) {
    throw new ErrorException($str, 0, $no, $file, $line);
});

function sanitize_text_field($s) { return trim(strip_tags((string) $s)); }
function wp_unslash($s) { return $s; }
function esc_html($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_url_raw($s) { return $s; }
function add_query_arg($k, $v) { return '?' . $k . '=' . $v; }
function apply_filters($tag, $v) { return $v; }
function wp_reset_postdata() {}
function paginate_links($a) { return '<nav data-total="' . $a['total'] . '" data-current="' . $a['current'] . '"></nav>'; }

$GLOBALS['fake_posts'] = [];
$GLOBALS['last_args'] = null;
$GLOBALS["current"] = null;
function get_the_content() { return $GLOBALS["current"]['content']; }
function get_the_title() { return $GLOBALS["current"]['title']; }

class WP_Query
{
    public int $max_num_pages = 0;
    private array $posts = [];
    private int $i = 0;
    public function __construct(array $args)
    {
        $GLOBALS['last_args'] = $args;
        $all = array_values(array_filter($GLOBALS['fake_posts'], fn($p) =>
            $args['s'] === '' || stripos($p['title'] . $p['content'], $args['s']) !== false));
        $per = $args['posts_per_page'];
        $this->max_num_pages = (int) ceil(count($all) / $per);
        $this->posts = array_slice($all, ($args['paged'] - 1) * $per, $per);
    }
    public function have_posts() { return $this->i < count($this->posts); }
    public function the_post() { $GLOBALS["current"] = $this->posts[$this->i++]; }
}

function render(array $get): string
{
    $_GET = $get;
    ob_start();
    include __DIR__ . '/../search-template.php';
    return ob_get_clean();
}

$fail = 0;
function check(string $name, bool $ok): void
{
    global $fail;
    echo ($ok ? 'PASS' : 'FAIL') . "  $name\n";
    if (!$ok) { $fail++; }
}

// 25 posts: post 1 has three [ad] markers (one alone in <p>, two inline), others plain.
$posts = [];
for ($n = 1; $n <= 25; $n++) {
    $posts[] = ['title' => "Post $n", 'content' => $n === 1
        ? "<p>Intro [ad] mid</p>\n<p>[ad]</p>\n<p>end [ad]</p>"
        : "<p>Body $n" . ($n === 13 ? ' needle' : '') . '</p>'];
}
$GLOBALS['fake_posts'] = $posts;

// 1. Missing parameters: no warnings, page 1, 10 posts, 3 pages.
$out = render([]);
check('missing params: no warning/exception, "Page 1 of 3"', str_contains($out, 'Page 1 of 3'));
check('missing params: 10 articles', substr_count($out, '<article>') === 10);
check('missing params: no "Search for" label', !str_contains($out, 'Search for'));
check('missing params: paged=1, s=""', $GLOBALS['last_args']['paged'] === 1 && $GLOBALS['last_args']['s'] === '');

// 2. Page 2.
$out = render(['page' => '2']);
check('page 2: "Page 2 of 3", posts 11-20', str_contains($out, 'Page 2 of 3') && str_contains($out, 'Post 11') && str_contains($out, 'Post 20') && !str_contains($out, 'Post 21'));
check('page 2: paged=2 passed (not "page")', $GLOBALS['last_args']['paged'] === 2 && !isset($GLOBALS['last_args']['page']));
check('page 2: no ads (post 1 is on page 1)', !str_contains($out, 'class="ad '));

// 2b. Hostile page values.
foreach (['0', '-5', 'abc', ['x']] as $bad) {
    render(['page' => $bad]);
    check('bad page ' . json_encode($bad) . ' -> paged=1', $GLOBALS['last_args']['paged'] === 1);
}

// 3. Search with results + escaping.
$out = render(['s' => 'needle']);
check('search hit: one article, "Search for needle"', substr_count($out, '<article>') === 1 && str_contains($out, 'Search for needle'));
$out = render(['s' => '<script>alert(1)</script>']);
check('search XSS: no raw <script> in output', !str_contains($out, '<script>'));
$out = render(['s' => ['a']]);
check('search as array: treated as empty, no error', str_contains($out, 'Page 1 of 3'));

// 4. No results.
$out = render(['s' => 'zzzz-nothing']);
check('no results: message shown', str_contains($out, 'No results for'));
check('no results: "Page 1 of 1", no article', str_contains($out, 'Page 1 of 1') && !str_contains($out, '<article>'));

require_once __DIR__ . '/../ads.php';
// 5. Multiple [ad] markers.
$out = render(['s' => 'Post 1']); // matches Post 1, Post 10-19
$html = $out;
check('ads: 3 divs from post 1', preg_match_all('#<div class="ad ad-\d+" data-ad-slot="\d+"></div>#', $html) === 3);
check('ads: unique ids ad-1, ad-2, ad-3', str_contains($html, 'ad-1"') && str_contains($html, 'ad-2"') && str_contains($html, 'ad-3"') && !str_contains($html, 'ad-4"'));
check('ads: no literal [ad] left', !str_contains($html, '[ad]'));
$c = 0;
$alone = bcm_replace_ad_markers("<p>a</p>\n<p>[ad]</p>\n<p>b</p>", $c);
check('ads: marker alone in <p> replaces the <p> (no div inside p)', $alone === "<p>a</p>\n<div class=\"ad ad-1\" data-ad-slot=\"1\"></div>\n<p>b</p>");

// 6. Unit: marker edge cases.
require_once __DIR__ . '/../ads.php';
$c = 0;
check('unit: no markers -> unchanged', bcm_replace_ad_markers('<p>hi</p>', $c) === '<p>hi</p>' && $c === 0);
$c = 0;
check('unit: other brackets/letters untouched (old bug: [ad] was a char class)', bcm_replace_ad_markers('add a dad [a] [d] [AD]', $c) === 'add a dad [a] [d] [AD]');
$c = 0;
check('unit: "[ad][ad]" adjacent -> 2 divs', substr_count(bcm_replace_ad_markers('[ad][ad]', $c), '<div') === 2 && $c === 2);

echo $fail === 0 ? "\nALL PASS\n" : "\n$fail FAILED\n";
exit($fail === 0 ? 0 : 1);
