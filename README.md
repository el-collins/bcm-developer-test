# BCM Developer Test

Written answers: `ANSWERS.md`. Evidence of checks: `evidence/`.

| Question | Where |
|----------|-------|
| 1 PHP | `q1-php/` |
| 2, 3, 7, 8, 10 (written) | `ANSWERS.md` |
| 4 CSS | `q4-css/` |
| 5 HTML, 6 JS | `q5-q6-html-js/` (open `index.html`) |
| 9 API | `q9-api/` |

## Setup

Needs Node 20+ (tested on 24), Java 11+ (HTML validator), Docker (PHP tests only), and a Chromium or Chrome.

```
cd tools && npm install
```

## Run the checks

```
# Q1: PHP 8.3 in Docker (WordPress is stubbed, no WP install needed)
cd q1-php && docker run --rm -v "$PWD:/app" -w /app php:8.3-cli php tests/run.php

# Q1 on real WordPress 7.1.3 (Docker; first start takes a few minutes)
bash q1-php/wp-check/run.sh

# Q4 and Q6: scripted real-browser checks (set CHROME to your chrome.exe path if the default in the scripts is wrong)
node tools/check-q4.mjs      # also regenerates the screenshots in q4-css/
node tools/check-q6.mjs

# Q5: HTML validation
java -jar tools/node_modules/vnu-jar/build/dist/vnu.jar q5-q6-html-js/index.html q4-css/index.html

# Q9
cd q9-api && node --test
```

## Time and what remains

Not timed precisely. All ten questions are answered. The Q8 personal example is the candidate's own account (WHMCS order-form and client-area customisation), written from what they described. With more time: add keyboard and screen-reader testing for Q4 and Q6, and run Q10 as an actual REST route with tests.

## AI use and how it was checked

AI (Claude) drafted the code, tests and written answers with instructions. Verification:

- **Q1:** the tests treat PHP warnings as failures and run on real PHP 8.3. They cover the four scenarios in the brief. The same scenarios also run on real WordPress in Docker (`q1-php/wp-check/run.sh`); that run found a bug the stubs missed (WordPress overwrites the globals `$page` and `$pages`).
- **Q4 and Q6:** a Playwright script measures element positions, order, separator patterns and hidden state in Chromium. Screenshots were produced by that run.
- **Q5:** the Nu HTML Checker was run on the original (to confirm which problems are real errors) and the corrected file (no errors).
- **Q9:** the mock service simulates accepted-then-timeout, 429 and invalid input.
- **Written answers (2, 3, 7, 8, 10)** are reasoned from general WordPress and web knowledge and were not run against a real site. The candidate should read them, change anything they disagree with, and be ready to explain every line.
