<?php
/**
 * Template: paginated, searchable post list with ad markers (corrected Q1).
 */
require_once __DIR__ . '/ads.php';

$page   = bcm_get_page($_GET);
$search = bcm_get_search($_GET);

$q = new WP_Query([
    'post_type'      => 'post',
    'post_status'    => 'publish',
    'posts_per_page' => 10,
    'paged'          => $page,
    's'              => $search,
]);

$pages = max(1, (int) $q->max_num_pages);
$ad_counter = 0;
?>
<h1>
    Page <?php echo (int) $page; ?> of <?php echo (int) $pages; ?>
    <?php if ($search !== '') : ?>: Search for <?php echo esc_html($search); ?><?php endif; ?>
</h1>

<?php if ($q->have_posts()) : ?>
    <?php while ($q->have_posts()) : $q->the_post(); ?>
        <?php
        $content = apply_filters('the_content', get_the_content());
        $content = bcm_replace_ad_markers($content, $ad_counter);
        ?>
        <article>
            <h2><?php echo esc_html(get_the_title()); ?></h2>
            <?php echo $content; ?>
        </article>
    <?php endwhile; ?>

    <?php
    echo paginate_links([
        'base'      => add_query_arg('page', '%#%'),
        'format'    => '',
        'current'   => $page,
        'total'     => $pages,
        'add_args'  => $search !== '' ? ['s' => $search] : [],
    ]);
    ?>
<?php else : ?>
    <p>
        <?php echo $search !== ''
            ? 'No results for &ldquo;' . esc_html($search) . '&rdquo;.'
            : 'No posts yet.'; ?>
    </p>
<?php endif; ?>
<?php wp_reset_postdata(); ?>
