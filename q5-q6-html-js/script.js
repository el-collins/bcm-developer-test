(function () {
    'use strict';

    var container = document.getElementById('paragraphs');
    var addButton = document.getElementById('add-btn');

    // Pristine copies of the three original paragraphs, taken before anything changes.
    var templates = Array.prototype.map.call(container.querySelectorAll(':scope > p'), function (p) {
        return p.cloneNode(true);
    });

    var imagesHidden = false;

    function hasImage(p) {
        return p.querySelector('img') !== null;
    }

    function applyVisibility(p) {
        if (hasImage(p)) {
            p.hidden = imagesHidden;
        }
    }

    // Fisher-Yates: unbiased shuffle (sort(() => Math.random() - .5) is biased).
    function shuffled(list) {
        var a = list.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    // Rebuild separators from scratch: HR after every pair when another paragraph follows.
    // All <p> count, hidden or not, because hiding is only display state.
    function renumberSeparators() {
        container.querySelectorAll(':scope > hr').forEach(function (hr) { hr.remove(); });
        var paras = container.querySelectorAll(':scope > p');
        paras.forEach(function (p, i) {
            var position = i + 1;
            if (position % 2 === 0 && position < paras.length) {
                var hr = document.createElement('hr');
                p.after(hr);
            }
        });
    }

    function addParagraphs() {
        shuffled(templates).forEach(function (tpl) {
            var copy = tpl.cloneNode(true);
            applyVisibility(copy); // new image paragraphs obey current toggle state
            container.appendChild(copy);
        });
        renumberSeparators();
    }

    // Second button, JavaScript only.
    var toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.id = 'toggle-btn';
    toggleButton.setAttribute('aria-pressed', 'false');
    toggleButton.textContent = 'Hide image paragraphs';
    addButton.after(toggleButton);

    toggleButton.addEventListener('click', function () {
        imagesHidden = !imagesHidden;
        container.querySelectorAll(':scope > p').forEach(applyVisibility);
        toggleButton.setAttribute('aria-pressed', String(imagesHidden));
        toggleButton.textContent = imagesHidden ? 'Show image paragraphs' : 'Hide image paragraphs';
    });

    addButton.addEventListener('click', addParagraphs);

    renumberSeparators(); // initial load: P1, P2, HR, P3
})();
