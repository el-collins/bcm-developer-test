#!/usr/bin/env bash
# Runs q1-php/search-template.php on a real WordPress (Docker) and checks the HTML it produces.
# Usage: bash q1-php/wp-check/run.sh      Needs: Docker.
set -u
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1
HERE="$(pwd -W 2>/dev/null || pwd)"
THEME="$HERE/theme"; SRC="$HERE/.."
NET=bcm-wp-net; DB=bcm-wp-db; WP=bcm-wp-web; PORT=8089
cleanup() { docker rm -f $WP $DB >/dev/null 2>&1; docker network rm $NET >/dev/null 2>&1; }
cleanup; trap cleanup EXIT
docker network create $NET >/dev/null
docker run -d --name $DB --network $NET -e MARIADB_ROOT_PASSWORD=pw -e MARIADB_DATABASE=wp mariadb:11 >/dev/null
docker run -d --name $WP --network $NET -p $PORT:80 \
  -e WORDPRESS_DB_HOST=$DB -e WORDPRESS_DB_USER=root -e WORDPRESS_DB_PASSWORD=pw -e WORDPRESS_DB_NAME=wp \
  -v "$THEME:/var/www/html/wp-content/themes/bcm-test" \
  -v "$SRC:/var/www/html/wp-content/themes/bcm-test/src:ro" wordpress:php8.3-apache >/dev/null
wpcli() { docker run --rm --network $NET --volumes-from $WP -e WORDPRESS_DB_HOST=$DB -e WORDPRESS_DB_USER=root -e WORDPRESS_DB_PASSWORD=pw -e WORDPRESS_DB_NAME=wp --user 33:33 wordpress:cli-php8.3 wp "$@"; }
echo "waiting for database..."
for i in $(seq 1 60); do wpcli db check >/dev/null 2>&1 && break; sleep 2; done
wpcli core install --url=http://localhost:$PORT --title=t --admin_user=a --admin_password=a --admin_email=a@example.com --skip-email >/dev/null
wpcli theme activate bcm-test >/dev/null
wpcli option update permalink_structure '' >/dev/null
# 25 posts, newest = highest number. Post 25 has three [ad] markers; post 13 contains "needle".
for n in $(seq 1 25); do
  c="<p>Body $n</p>"
  [ $n = 13 ] && c="<p>Body 13 needle</p>"
  [ $n = 25 ] && c=$'<p>Intro [ad] mid</p>\n\n[ad]\n\n<p>end [ad] adtest</p>'
  wpcli post create --post_title="Post $n" --post_content="$c" --post_status=publish --post_date="2026-01-01 00:$(printf %02d $n):00" >/dev/null
done
fail=0
get() { curl -s "http://localhost:$PORT/$1"; }
check() { if eval "$2"; then echo "PASS  $1"; else echo "FAIL  $1"; fail=$((fail+1)); fi; }
arts() { grep -o '<article>' | wc -l; }

p1=$(get ""); p2=$(get "?page=2"); p3=$(get "?page=3")
check "no parameters: 'Page 1 of 3' and 10 articles"        '[ "$(echo "$p1" | arts)" = 10 ] && echo "$p1" | tr -s " \n" " " | grep -q "Page 1 of 3"'
check "page 2: 'Page 2 of 3' and 10 articles"               '[ "$(echo "$p2" | arts)" = 10 ] && echo "$p2" | tr -s " \n" " " | grep -q "Page 2 of 3"'
check "page 2 shows different posts than page 1"            '[ "$(echo "$p1" | grep -o "Post [0-9]*" | sort)" != "$(echo "$p2" | grep -o "Post [0-9]*" | sort)" ]'
check "page 3 has the last 5 posts"                         '[ "$(echo "$p3" | arts)" = 5 ]'
check "pagination links present and keep search term"       'get "?s=Post&page=2" | grep -q "s=Post"'
check "search 'needle': one article, label shown"           's=$(get "?s=needle"); [ "$(echo "$s" | arts)" = 1 ] && echo "$s" | grep -q "Search for needle"'
check "no results: message shown, no articles"              's=$(get "?s=zzzzqq"); echo "$s" | grep -q "No results for" && [ "$(echo "$s" | arts)" = 0 ]'
a=$(get "?s=adtest")
check "3 [ad] markers become 3 divs, ids 1-3"               '[ "$(echo "$a" | grep -o "<div class=\"ad ad-[0-9]*\"" | wc -l)" = 3 ] && echo "$a" | grep -q "ad-3\""'
check "no literal [ad] left in the page"                    '! echo "$a" | grep -q "\[ad\]"'
check "search term is escaped (no raw <script>)"            '! get "?s=%3Cscript%3Ealert(1)%3C/script%3E" | grep -q "<script>alert"'
check "junk page value (?page=abc) does not break the page" 'get "?page=abc" | tr -s " \n" " " | grep -q "Page 1 of 3"'
docker logs $WP 2>&1 | grep -iE "PHP (Warning|Notice|Deprecated|Fatal)" > /tmp/wp-php-errors.txt
check "no PHP warnings, notices or fatals in the server log" '[ ! -s /tmp/wp-php-errors.txt ]'
[ -s /tmp/wp-php-errors.txt ] && cat /tmp/wp-php-errors.txt
echo; [ $fail = 0 ] && echo "ALL PASS (real WordPress $(wpcli core version 2>/dev/null), PHP 8.3)" || echo "$fail FAILED"
exit $fail
